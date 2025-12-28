// handlers/economy.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'economy.sqlite');
const db = new Database(dbPath);

// ---------- PRAGMA ----------
try {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
} catch (e) {
  console.warn('PRAGMA failed:', e?.message || e);
}

// ---------- USERS TABLE ----------
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  wallet INTEGER DEFAULT 0,
  bank INTEGER DEFAULT 0,

  lifetime_earned INTEGER DEFAULT 0,
  lifetime_lost INTEGER DEFAULT 0,

  faction_id TEXT DEFAULT NULL,

  last_daily INTEGER DEFAULT 0,
  daily_streak INTEGER DEFAULT 0,
  dailies_this_month INTEGER DEFAULT 0,
  non_gambling_earned_month INTEGER DEFAULT 0,
  monthly_claimed_at INTEGER DEFAULT 0,

  inventory TEXT DEFAULT '[]',
  cooldowns TEXT DEFAULT '{}',
  modifiers TEXT DEFAULT '{}'
)
`).run();

// ---------- CORE HELPERS ----------
function ensureUser(userId) {
  const row = db.prepare('SELECT user_id FROM users WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare(`
      INSERT INTO users (user_id, wallet, bank)
      VALUES (?, 0, 0)
    `).run(userId);
  }
}

function getUser(userId) {
  ensureUser(userId);
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
}

// ---------- WALLET / BANK ----------
function setWallet(userId, amount) {
  ensureUser(userId);
  db.prepare('UPDATE users SET wallet = ? WHERE user_id = ?')
    .run(Math.floor(amount), userId);
}

function addWallet(userId, amount) {
  ensureUser(userId);
  db.prepare('UPDATE users SET wallet = wallet + ? WHERE user_id = ?')
    .run(Math.floor(amount), userId);
}

function addBank(userId, amount) {
  ensureUser(userId);
  db.prepare('UPDATE users SET bank = bank + ? WHERE user_id = ?')
    .run(Math.floor(amount), userId);
}

// ---------- LIFETIME STATS ----------
function addLifetimeEarned(userId, amount) {
  ensureUser(userId);
  db.prepare('UPDATE users SET lifetime_earned = lifetime_earned + ? WHERE user_id = ?')
    .run(Math.floor(amount), userId);
}

function addLifetimeLost(userId, amount) {
  ensureUser(userId);
  db.prepare('UPDATE users SET lifetime_lost = lifetime_lost + ? WHERE user_id = ?')
    .run(Math.floor(amount), userId);
}

// ---------- DAILY / MONTHLY ----------
function setLastDaily(userId, ts) {
  ensureUser(userId);
  db.prepare('UPDATE users SET last_daily = ? WHERE user_id = ?')
    .run(ts || 0, userId);
}

function setDailyStreak(userId, streak) {
  ensureUser(userId);
  db.prepare('UPDATE users SET daily_streak = ? WHERE user_id = ?')
    .run(streak, userId);
}

function incrementDailiesMonth(userId) {
  ensureUser(userId);
  db.prepare('UPDATE users SET dailies_this_month = dailies_this_month + 1 WHERE user_id = ?')
    .run(userId);
}

function addNonGamblingEarnedMonth(userId, amount) {
  ensureUser(userId);
  db.prepare(`
    UPDATE users
    SET non_gambling_earned_month = non_gambling_earned_month + ?
    WHERE user_id = ?
  `).run(Math.floor(amount), userId);
}

function resetMonthlyProgress(userId) {
  ensureUser(userId);
  db.prepare(`
    UPDATE users
    SET dailies_this_month = 0,
        non_gambling_earned_month = 0
    WHERE user_id = ?
  `).run(userId);
}

function setMonthlyClaimedAt(userId, ts) {
  ensureUser(userId);
  db.prepare('UPDATE users SET monthly_claimed_at = ? WHERE user_id = ?')
    .run(ts || 0, userId);
}

// ---------- MODIFIERS (ITEM EFFECTS / HIDDEN BOOSTS) ----------
function getModifiers(userId) {
  ensureUser(userId);
  const row = db.prepare('SELECT modifiers FROM users WHERE user_id = ?').get(userId);
  return JSON.parse(row.modifiers || '{}');
}

function setModifiers(userId, mods) {
  ensureUser(userId);
  db.prepare('UPDATE users SET modifiers = ? WHERE user_id = ?')
    .run(JSON.stringify(mods), userId);
}

function applyModifier(userId, key, value) {
  const mods = getModifiers(userId);
  mods[key] = value;
  setModifiers(userId, mods);
}

function clearModifier(userId, key) {
  const mods = getModifiers(userId);
  delete mods[key];
  setModifiers(userId, mods);
}

// ---------- EXPORT ----------
module.exports = {
  db,

  // core
  ensureUser,
  getUser,

  // money
  setWallet,
  addWallet,
  addBank,

  // stats
  addLifetimeEarned,
  addLifetimeLost,

  // daily / monthly
  setLastDaily,
  setDailyStreak,
  incrementDailiesMonth,
  addNonGamblingEarnedMonth,
  resetMonthlyProgress,
  setMonthlyClaimedAt,

  // modifiers
  getModifiers,
  applyModifier,
  clearModifier
};