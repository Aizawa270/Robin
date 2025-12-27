// handlers/items.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'items.sqlite');
const db = new Database(dbPath);

// PRAGMA for durability
try {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
} catch (e) {
  console.warn('Could not set PRAGMA on items DB:', e?.message || e);
}

// master item table
db.prepare(`
CREATE TABLE IF NOT EXISTS items_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  rarity TEXT NOT NULL,
  description TEXT,
  type TEXT,
  data TEXT DEFAULT '{}'
)
`).run();

// user inventory (one row per user+item)
db.prepare(`
CREATE TABLE IF NOT EXISTS user_items (
  user_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, item_id)
)
`).run();

// trades table (pending)
db.prepare(`
CREATE TABLE IF NOT EXISTS pending_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  offer_json TEXT NOT NULL, -- { coins:0, items: [{item_id,qty},...] }
  request_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
`).run();

// ---------- Master items helpers ----------
function addMasterItem({ name, slug, rarity = 'common', description = '', type = 'consumable', data = {} }) {
  const info = db.prepare(`
    INSERT INTO items_master (name, slug, rarity, description, type, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, slug, rarity, description, type, JSON.stringify(data));
  return getMasterItem(info.lastInsertRowid);
}
function getMasterItem(idOrSlug) {
  if (!idOrSlug) return null;
  if (/^\d+$/.test(String(idOrSlug))) {
    return db.prepare(`SELECT * FROM items_master WHERE id = ?`).get(Number(idOrSlug));
  }
  return db.prepare(`SELECT * FROM items_master WHERE slug = ?`).get(String(idOrSlug).toLowerCase());
}
function listMasterItems() {
  return db.prepare(`SELECT id, name, slug, rarity, description, type FROM items_master ORDER BY id`).all();
}

// ---------- Inventory helpers ----------
function giveItem(userId, itemId, qty = 1) {
  qty = Math.max(0, Math.floor(qty));
  if (!qty) return false;
  const now = Date.now();
  db.prepare(`
    INSERT INTO user_items (user_id, item_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
  `).run(userId, itemId, qty, qty);
  return true;
}
function removeItem(userId, itemId, qty = 1) {
  qty = Math.max(0, Math.floor(qty));
  if (!qty) return false;
  const row = db.prepare(`SELECT quantity FROM user_items WHERE user_id = ? AND item_id = ?`).get(userId, itemId);
  if (!row || row.quantity < qty) return false;
  const newQty = row.quantity - qty;
  if (newQty <= 0) {
    db.prepare(`DELETE FROM user_items WHERE user_id = ? AND item_id = ?`).run(userId, itemId);
  } else {
    db.prepare(`UPDATE user_items SET quantity = ? WHERE user_id = ? AND item_id = ?`).run(newQty, userId, itemId);
  }
  return true;
}
function getUserInventory(userId) {
  const rows = db.prepare(`
    SELECT ui.item_id, ui.quantity, im.name, im.slug, im.rarity, im.description
    FROM user_items ui
    LEFT JOIN items_master im ON im.id = ui.item_id
    WHERE ui.user_id = ? AND ui.quantity > 0
    ORDER BY im.rarity, im.name
  `).all(userId);
  return rows;
}
function getUserItemQty(userId, itemId) {
  return db.prepare(`SELECT quantity FROM user_items WHERE user_id = ? AND item_id = ?`).get(userId, itemId)?.quantity || 0;
}

// ---------- Trades ----------
function createTrade(fromId, toId, offerObj, requestObj) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO pending_trades (from_id, to_id, offer_json, request_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(fromId, toId, JSON.stringify(offerObj), JSON.stringify(requestObj), now);
  return db.prepare(`SELECT * FROM pending_trades WHERE id = ?`).get(info.lastInsertRowid);
}
function getPendingTrade(tradeId) {
  return db.prepare(`SELECT * FROM pending_trades WHERE id = ?`).get(tradeId);
}
function listPendingTradesFor(userId) {
  return db.prepare(`SELECT * FROM pending_trades WHERE to_id = ? ORDER BY created_at`).all(userId);
}
function deleteTrade(tradeId) {
  db.prepare(`DELETE FROM pending_trades WHERE id = ?`).run(tradeId);
}

// ---------- Bootstrap sample items (only if master empty) ----------
function bootstrapIfEmpty() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM items_master`).get().c;
  if (count === 0) {
    const items = [
      // ====== COMMON (20) ======
      { name: 'Common Kit', slug: 'common-kit', rarity: 'common', type: 'consumable', description: 'A basic kit. Single use. Small job reward boost.', data: { jobBoostPct: 0.05, uses: 1 } },
      { name: 'Pocket Change', slug: 'pocket-change', rarity: 'common', type: 'currency', description: 'Small coin pouch. Instant 500–1,000 Vyncoins when used.', data: { min: 500, max: 1000 } },
      { name: 'Worker\'s Snack', slug: 'workers-snack', rarity: 'common', type: 'consumable', description: 'Reduces next job cooldown by 5 minutes.', data: { reduceJobCooldownMs: 5*60*1000 } },
      { name: 'Small XP Tonic', slug: 'small-xp-tonic', rarity: 'common', type: 'consumable', description: '+5% job XP for next work.', data: { xpBoostPct: 0.05, uses: 1 } },
      { name: 'Trade Voucher', slug: 'trade-voucher', rarity: 'common', type: 'currency', description: 'Redeemable for small shop discounts or trade value.', data: { value: 1000 } },
      { name: 'Basic Toolkit', slug: 'basic-toolkit', rarity: 'common', type: 'consumable', description: 'Slightly increases find/explore success chance.', data: { exploreBoostPct: 0.05, uses: 1 } },
      { name: 'Lucky Coin', slug: 'lucky-coin', rarity: 'common', type: 'vanity', description: 'No gameplay effect. Flex item.', data: {} },
      { name: 'Starter Pet', slug: 'starter-pet', rarity: 'common', type: 'pet', description: 'Cosmetic pet. Small daily bonus (100 coins).', data: { dailyBonus: 100 } },
      { name: 'Crowbar', slug: 'crowbar', rarity: 'common', type: 'gear', description: 'Occasionally unlocks small loot in find.', data: { findBoostPct: 0.03 } },
      { name: 'Map Fragment', slug: 'map-fragment', rarity: 'common', type: 'quest', description: 'Collect 5 to claim a small reward.', data: { partOf: 'treasure_map', partsNeeded: 5 } },
      { name: 'Basic Charm', slug: 'basic-charm', rarity: 'common', type: 'consumable', description: 'Slightly reduces beg cooldown once.', data: { reduceBegCooldown: true, uses: 1 } },
      { name: 'Rusty Token', slug: 'rusty-token', rarity: 'common', type: 'currency', description: 'Tradable token with minor value.', data: { value: 250 } },
      { name: 'Common Badge', slug: 'common-badge', rarity: 'common', type: 'vanity', description: 'Badge showing you grind.', data: {} },
      { name: 'Coffee Voucher', slug: 'coffee-voucher', rarity: 'common', type: 'consumable', description: 'Instant small stamina boost for jobs (flavor).', data: { jobBoostPct: 0.02, uses: 1 } },
      { name: 'Pocket Knife', slug: 'pocket-knife', rarity: 'common', type: 'gear', description: 'Small chance to avoid a penalty in jobs.', data: { avoidPenaltyPct: 0.02 } },
      { name: 'Beginner\'s Charm', slug: 'beginners-charm', rarity: 'common', type: 'consumable', description: 'Slightly increases beg payout once.', data: { begBoostPct: 0.05, uses: 1 } },
      { name: 'Cloth Mask', slug: 'cloth-mask', rarity: 'common', type: 'vanity', description: 'Cosmetic. No gameplay effect.', data: {} },
      { name: 'Field Ration', slug: 'field-ration', rarity: 'common', type: 'consumable', description: 'Prevents a small negative event on next explore.', data: { preventSmallLoss: true, uses: 1 } },
      { name: 'Sellable Scrap', slug: 'sellable-scrap', rarity: 'common', type: 'currency', description: 'Can be sold for ~2k coins.', data: { value: 2000 } },
      { name: 'Wooden Emblem', slug: 'wooden-emblem', rarity: 'common', type: 'vanity', description: 'Small title aesthetics.', data: {} },

      // ====== UNCOMMON (12) ======
      { name: 'Uncommon Toolkit', slug: 'uncommon-toolkit', rarity: 'uncommon', type: 'consumable', description: 'Boosts job payout by 8% for one use.', data: { jobBoostPct: 0.08, uses: 1 } },
      { name: 'Silver Token', slug: 'silver-token', rarity: 'uncommon', type: 'currency', description: 'Worth a moderate amount (5k).', data: { value: 5000 } },
      { name: 'Explorer\'s Shovel', slug: 'explorers-shovel', rarity: 'uncommon', type: 'gear', description: 'Increases explore max reward and chance of items.', data: { exploreMaxIncrease: 3000, exploreBoostPct: 0.08 } },
      { name: 'Lucky Charm', slug: 'lucky-charm', rarity: 'uncommon', type: 'consumable', description: 'Improves gambling neutral outcomes slightly once.', data: { gamblingNeutralBoost: 0.03, uses: 1 } },
      { name: 'Rare Bait', slug: 'rare-bait', rarity: 'uncommon', type: 'consumable', description: 'Use in find to increase chance of rare animal/item.', data: { findRareBoostPct: 0.12, uses: 1 } },
      { name: 'Tinker\'s Kit', slug: 'tinkers-kit', rarity: 'uncommon', type: 'consumable', description: 'Increases chances of high payouts from jobs once.', data: { jobBoostPct: 0.10, uses: 1 } },
      { name: 'Pocket Ledger', slug: 'pocket-ledger', rarity: 'uncommon', type: 'vanity', description: 'Shows small balance flair + minor bank interest (flavor).', data: { bankInterestPct: 0.002 } },
      { name: 'Pet Fox', slug: 'pet-fox', rarity: 'uncommon', type: 'pet', description: 'Gives a 250 coin daily bonus.', data: { dailyBonus: 250 } },
      { name: 'Quality Toolkit', slug: 'quality-toolkit', rarity: 'uncommon', type: 'consumable', description: 'Increases job XP by 10% for one use.', data: { xpBoostPct: 0.10, uses: 1 } },
      { name: 'Mystery Key', slug: 'mystery-key', rarity: 'uncommon', type: 'quest', description: 'Opens a small locked chest event.', data: { opensChest: true } },
      { name: 'Guild Token', slug: 'guild-token', rarity: 'uncommon', type: 'currency', description: 'Contribute to faction vault; adds status.', data: { value: 10000 } },
      { name: 'Merchant\'s Receipt', slug: 'merchants-receipt', rarity: 'uncommon', type: 'consumable', description: 'Small guaranteed coins on next find.', data: { guaranteedFindCoins: 2000, uses: 1 } },

      // ====== RARE (8) ======
      { name: 'Rare Token', slug: 'rare-token', rarity: 'rare', type: 'quest', description: 'Used in faction events and special trades.', data: { eventWeight: 1 } },
      { name: 'Veteran\'s Compass', slug: 'veterans-compass', rarity: 'rare', type: 'gear', description: 'Big boost to explore rewards once.', data: { exploreBoostPct: 0.20, uses: 1 } },
      { name: 'Bank Vault Key', slug: 'bank-vault-key', rarity: 'rare', type: 'consumable', description: 'Temporarily increases bank interest and safety for 24 hours.', data: { bankInterestPct: 0.02, durationMs: 24*60*60*1000 } },
      { name: 'Golden Bait', slug: 'golden-bait', rarity: 'rare', type: 'consumable', description: 'High chance to find valuable animals/items (max 15k).', data: { findMax: 15000, findRareBoostPct: 0.35, uses: 1 } },
      { name: 'Lucky Horseshoe', slug: 'lucky-horseshoe', rarity: 'rare', type: 'consumable', description: 'One-time gambling safeplay: reduces chance of hard wipe once.', data: { reduceHardLossOnce: true } },
      { name: 'Rare Pet: Hawk', slug: 'pet-hawk', rarity: 'rare', type: 'pet', description: 'Daily bonus +500 coins. Small utility in explore.', data: { dailyBonus: 500 } },
      { name: 'Sturdy Toolkit', slug: 'sturdy-toolkit', rarity: 'rare', type: 'consumable', description: '+15% job payout for one use.', data: { jobBoostPct: 0.15, uses: 1 } },
      { name: 'Artifact Shard', slug: 'artifact-shard', rarity: 'rare', type: 'quest', description: 'Trade 3 shards for a legendary reward in faction events.', data: { partOf: 'artifact', partsNeeded: 3 } },

      // ====== LEGENDARY (5) ======
      { name: 'Legendary Sigil', slug: 'legendary-sigil', rarity: 'legendary', type: 'consumable', description: 'Huge one-time job payout boost (40%) or convert to a large coin sum.', data: { jobBoostPct: 0.40, uses: 1, convertibleCoins: 150000 } },
      { name: 'Mythic Banner', slug: 'mythic-banner', rarity: 'legendary', type: 'vanity', description: 'Faction/banner item. Massive prestige and faction event weight.', data: { factionBoostPct: 0.10 } },
      { name: 'Phantom Pet', slug: 'phantom-pet', rarity: 'legendary', type: 'pet', description: 'Daily bonus +2k coins and passive explore perks.', data: { dailyBonus: 2000, exploreBoostPct: 0.10 } },
      { name: 'Vault Master Key', slug: 'vault-master-key', rarity: 'legendary', type: 'consumable', description: 'One-time massive bank interest + safety window (48h).', data: { bankInterestPct: 0.05, durationMs: 48*60*60*1000 } },
      { name: 'Legendary Token', slug: 'legendary-token', rarity: 'legendary', type: 'currency', description: 'High-value token used in top-tier faction events.', data: { value: 50000 } }
    ];

    for (const it of items) {
      try {
        addMasterItem({
          name: it.name,
          slug: it.slug,
          rarity: it.rarity,
          description: it.description,
          type: it.type,
          data: it.data || {}
        });
      } catch (e) {
        console.error('bootstrap addMasterItem error for', it.slug, e);
      }
    }

    console.log(`[Items] Bootstrapped ${items.length} master items.`);
  }
}
bootstrapIfEmpty();

module.exports = {
  db,
  // master
  addMasterItem,
  getMasterItem,
  listMasterItems,
  // inventory
  giveItem,
  removeItem,
  getUserInventory,
  getUserItemQty,
  // trades
  createTrade,
  getPendingTrade,
  listPendingTradesFor,
  deleteTrade
};