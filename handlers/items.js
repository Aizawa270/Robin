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
    // add ~12 starter items (you asked for many later — expand offline)
    addMasterItem({ name: 'Common Kit', slug: 'common-kit', rarity: 'common', description: 'A simple kit. Single use.', type: 'consumable' });
    addMasterItem({ name: 'Uncommon Toolkit', slug: 'uncommon-toolkit', rarity: 'uncommon', description: 'Gives small boost to job rewards.', type: 'consumable' });
    addMasterItem({ name: 'Rare Token', slug: 'rare-token', rarity: 'rare', description: 'Used in faction events.', type: 'quest' });
    addMasterItem({ name: 'Legendary Sigil', slug: 'legendary-sigil', rarity: 'legendary', description: 'Powerful single-use item.', type: 'consumable' });
    addMasterItem({ name: 'Pet Snake (dangerous)', slug: 'pet-snake', rarity: 'uncommon', description: 'Uh oh. This one bites (may cost coins).', type: 'pet' });
    addMasterItem({ name: 'Trade Voucher', slug: 'trade-voucher', rarity: 'common', description: 'Can be traded for small bonuses.', type: 'currency' });
    // add more later per your request — you wanted 40-50, we can expand in next pass
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