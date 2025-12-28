// handlers/items.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// ================= SETUP =================
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'items.sqlite'));
db.pragma('journal_mode = WAL');

// ================= TABLES =================
db.prepare(`
CREATE TABLE IF NOT EXISTS items_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  rarity TEXT NOT NULL,
  description TEXT NOT NULL,
  effect TEXT NOT NULL,
  type TEXT NOT NULL
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS user_items (
  user_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_id)
)
`).run();

// ================= CORE QUERIES =================
function getItemBySlug(slug) {
  return db.prepare(`SELECT * FROM items_master WHERE slug = ?`).get(slug);
}

function getItemById(id) {
  return db.prepare(`SELECT * FROM items_master WHERE id = ?`).get(id);
}

function listMasterItems() {
  return db.prepare(`
    SELECT * FROM items_master
    ORDER BY 
      CASE rarity
        WHEN 'common' THEN 1
        WHEN 'uncommon' THEN 2
        WHEN 'rare' THEN 3
        WHEN 'epic' THEN 4
        WHEN 'legendary' THEN 5
      END, name
  `).all();
}

// ================= INVENTORY =================
function giveItem(userId, itemId, qty = 1) {
  if (!qty || qty <= 0) return false;

  db.prepare(`
    INSERT INTO user_items (user_id, item_id, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, item_id)
    DO UPDATE SET quantity = quantity + ?
  `).run(userId, itemId, qty, qty);

  return true;
}

function removeItem(userId, itemId, qty = 1) {
  const row = db.prepare(`
    SELECT quantity FROM user_items
    WHERE user_id = ? AND item_id = ?
  `).get(userId, itemId);

  if (!row || row.quantity < qty) return false;

  if (row.quantity === qty) {
    db.prepare(`DELETE FROM user_items WHERE user_id = ? AND item_id = ?`)
      .run(userId, itemId);
  } else {
    db.prepare(`
      UPDATE user_items
      SET quantity = quantity - ?
      WHERE user_id = ? AND item_id = ?
    `).run(qty, userId, itemId);
  }

  return true;
}

function getUserItemQty(userId, itemId) {
  return db.prepare(`
    SELECT quantity FROM user_items
    WHERE user_id = ? AND item_id = ?
  `).get(userId, itemId)?.quantity || 0;
}

function getInventory(userId) {
  return db.prepare(`
    SELECT im.*, ui.quantity
    FROM user_items ui
    JOIN items_master im ON im.id = ui.item_id
    WHERE ui.user_id = ? AND ui.quantity > 0
    ORDER BY
      CASE im.rarity
        WHEN 'common' THEN 1
        WHEN 'uncommon' THEN 2
        WHEN 'rare' THEN 3
        WHEN 'epic' THEN 4
        WHEN 'legendary' THEN 5
      END, im.name
  `).all(userId);
}

// ================= ITEM SEED (45 REAL ITEMS) =================
const ITEM_SEED = [
  // COMMON (15)
  ['Rust Coin','rust-coin','common','Slightly boosts job income.','job_bonus_2','passive'],
  ['Bent Dice','bent-dice','common','Reroll one lost gamble daily.','reroll_gamble','active'],
  ['Courier Tag','courier-tag','common','Reduces cooldowns slightly.','cooldown_5','passive'],
  ['Cracked Ledger','cracked-ledger','common','Better bank efficiency.','bank_eff_5','passive'],
  ['Pocket Lighter','pocket-lighter','common','Double next work payout, breaks.','double_work','active'],
  ['Street Permit','street-permit','common','Unlocks shady job paths.','unlock_shady','passive'],
  ['Fake ID','fake-id','common','Ignore one job cooldown.','skip_job_cd','active'],
  ['Loose Change Bag','loose-change-bag','common','Convert item into coins.','scrap_item','active'],
  ['Scrap Token','scrap-token','common','Extra inventory slot.','inv_slot_1','passive'],
  ['Dirty Contract','dirty-contract','common','Risky job payout.','risky_job','active'],
  ['Shady Receipt','shady-receipt','common','Reduced gambling loss.','gamble_loss_3','passive'],
  ['Cracked Watch','cracked-watch','common','Shorter daily cooldowns.','daily_cd_minus','passive'],
  ['Low-Grade Charm','low-grade-charm','common','Tiny luck boost.','luck_1','passive'],
  ['Pawn Ticket','pawn-ticket','common','Sell item for fixed value.','pawn_item','active'],
  ['Marked Coin','marked-coin','common','Faction attention.','faction_notice','passive'],

  // UNCOMMON (12)
  ['Weighted Dice','weighted-dice','uncommon','Higher gamble wins.','gamble_win_4','passive'],
  ['Union Badge','union-badge','uncommon','Better job payouts.','job_bonus_8','passive'],
  ['Night Ledger','night-ledger','uncommon','Faster bank ticks.','bank_tick','passive'],
  ['False Blessing','false-blessing','uncommon','Double or lose next win.','double_or_zero','active'],
  ['Smuggler Pouch','smuggler-pouch','uncommon','More inventory space.','inv_slot_3','passive'],
  ['Blood Contract','blood-contract','uncommon','Forced faction mission.','forced_faction','active'],
  ['Counterfeit Seal','counterfeit-seal','uncommon','Shop discounts.','shop_5','passive'],
  ['Backroom Key','backroom-key','uncommon','Unlock secret actions.','unlock_secret','passive'],
  ['Luck Fragment','luck-fragment','uncommon','Stackable luck.','luck_stack','passive'],
  ['Tax Evasion File','tax-evasion-file','uncommon','No gamble fees.','no_fees','passive'],
  ['Iron Will Token','iron-will-token','uncommon','Cooldown resistance.','cd_resist','passive'],
  ['Black Ink Stamp','black-ink-stamp','uncommon','Retry failed job.','retry_job','active'],

  // RARE (9)
  ['Dealer Eye','dealer-eye','rare','Reveal odds.','see_odds','passive'],
  ['Golden Ledger','golden-ledger','rare','Higher bank cap.','bank_cap_20','passive'],
  ['Mercenary Emblem','mercenary-emblem','rare','Faction boost.','faction_15','passive'],
  ['Loaded Coin','loaded-coin','rare','Guarantee next win.','guarantee_win','active'],
  ['Shadow Permit','shadow-permit','rare','Illegal jobs.','unlock_illegal','passive'],
  ['Luck Core','luck-core','rare','Major luck boost.','luck_5','passive'],
  ['Vault Skeleton Key','vault-key','rare','Bank theft.','bank_steal','active'],
  ['Time Fracture','time-fracture','rare','Reset cooldowns.','reset_cd','active'],
  ['Oathbreaker Token','oathbreaker-token','rare','Leave faction safely.','leave_faction','active'],

  // EPIC (6)
  ['Devil Ledger','devil-ledger','epic','High risk high reward.','devil_trade','passive'],
  ['Entropy Dice','entropy-dice','epic','Ignore caps.','no_caps','active'],
  ['Faction Crown Shard','faction-crown','epic','Faction dominance.','faction_30','passive'],
  ['Black Market Writ','black-writ','epic','Safe illegal actions.','illegal_safe','passive'],
  ['Fate Anchor','fate-anchor','epic','Negate one loss.','negate_loss','active'],
  ['Chrono Seal','chrono-seal','epic','Cooldown reduction.','cd_25','passive'],

  // LEGENDARY (3)
  ['Hand of Fortune','hand-of-fortune','legendary','Luck scales with wealth.','dynamic_luck','passive'],
  ['Sovereign Sigil','sovereign-sigil','legendary','Global boost.','global_20','passive'],
  ['Reality Die','reality-die','legendary','Reroll any outcome.','reroll_any','active'],
];

// ================= SEED & PATCH =================
function seedOrPatchItems() {
  for (const item of ITEM_SEED) {
    const exists = db.prepare('SELECT id FROM items_master WHERE slug = ?').get(item[1]);
    if (!exists) {
      db.prepare('INSERT INTO items_master (name, slug, rarity, description, effect, type) VALUES (?, ?, ?, ?, ?, ?)')
        .run(...item);
      console.log(`Inserted missing item: ${item[0]}`);
    }
  }
}

seedOrPatchItems();

// ================= EXPORTS =================
module.exports = {
  db,

  // master
  getItemBySlug,
  getItemById,
  listMasterItems,

  // inventory
  giveItem,
  removeItem,
  getUserItemQty,
  getInventory,

  // seed (for patching if needed)
  ITEM_SEED,
  seedOrPatchItems,
};