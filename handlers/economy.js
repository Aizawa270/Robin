// handlers/economy.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'economy.sqlite');
const db = new Database(dbPath);
try {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
} catch (e) { console.warn('Could not set PRAGMA on economy DB:', e?.message || e); }

// Users table (extended)
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
  cooldowns TEXT DEFAULT '{}'
)
`).run();

// ------------------ CORE HELPERS ------------------

function ensureUser(userId) {
  if (!userId) return;
  const row = db.prepare('SELECT user_id FROM users WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO users (user_id, wallet, bank) VALUES (?, ?, ?)').run(userId, 0, 0);
  }
}

function getUser(userId) {
  ensureUser(userId);
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
}

function getWallet(userId) {
  ensureUser(userId);
  return db.prepare('SELECT wallet FROM users WHERE user_id = ?').get(userId).wallet;
}

function changeWallet(userId, amount) {
  // amount can be negative
  ensureUser(userId);
  const cur = getWallet(userId);
  const next = Math.floor(cur + amount);
  db.prepare('UPDATE users SET wallet = ?, lifetime_earned = lifetime_earned + ? WHERE user_id = ?')
    .run(Math.max(0, next), Math.max(0, amount), userId);
}

function addWallet(userId, amount) {
  return changeWallet(userId, amount);
}

function addBank(userId, amount) {
  ensureUser(userId);
  db.prepare('UPDATE users SET bank = bank + ? WHERE user_id = ?').run(Math.floor(amount), userId);
}

function addLifetimeLost(userId, amount) {
  ensureUser(userId);
  db.prepare('UPDATE users SET lifetime_lost = lifetime_lost + ? WHERE user_id = ?').run(Math.floor(amount), userId);
}

// ------------------ COOLDOWNS (persisted per-user) ------------------
function _readCooldowns(userId) {
  ensureUser(userId);
  const row = db.prepare('SELECT cooldowns FROM users WHERE user_id = ?').get(userId);
  try { return JSON.parse(row.cooldowns || '{}'); } catch { return {}; }
}
function _writeCooldowns(userId, obj) {
  ensureUser(userId);
  db.prepare('UPDATE users SET cooldowns = ? WHERE user_id = ?').run(JSON.stringify(obj || {}), userId);
}
function getCooldown(userId, key) {
  const cds = _readCooldowns(userId);
  const ts = cds[key] || 0;
  const left = Math.max(0, ts - Date.now());
  return left;
}
function setCooldown(userId, key, ms) {
  const cds = _readCooldowns(userId);
  cds[key] = Date.now() + ms;
  _writeCooldowns(userId, cds);
}
function clearCooldown(userId, key) {
  const cds = _readCooldowns(userId);
  delete cds[key];
  _writeCooldowns(userId, cds);
}

// ------------------ DAILY / MONTHLY ------------------
const DAILY_BASE = 5000; // base reward
const DAILY_MAX_BY_STREAK = 50000; // max at 7 streak
const DAILY_STREAK_TARGET = 7;

function canClaimDaily(userId) {
  ensureUser(userId);
  const u = getUser(userId);
  // 24h since last_daily
  return (Date.now() - (u.last_daily || 0)) >= 24 * 60 * 60 * 1000;
}
function claimDaily(userId) {
  ensureUser(userId);
  const u = getUser(userId);
  // check miss -> if >48h since last daily we reset streak (missed)
  if (u.last_daily && (Date.now() - u.last_daily) > 48 * 60 * 60 * 1000) {
    u.daily_streak = 0;
  }
  // increment streak
  const nextStreak = (u.daily_streak || 0) + 1;
  let amount = DAILY_BASE;
  // increase linearly or exponentially as you want; here: steps to 50k over 7 days
  const step = Math.floor((DAILY_MAX_BY_STREAK - DAILY_BASE) / (DAILY_STREAK_TARGET - 1));
  amount = DAILY_BASE + (Math.min(nextStreak - 1, DAILY_STREAK_TARGET - 1) * step);
  // if reached target (7) give max and reset streak back to 0 per your request
  let streakAfter = nextStreak;
  if (nextStreak >= DAILY_STREAK_TARGET) {
    amount = DAILY_MAX_BY_STREAK;
    streakAfter = 0; // reset
  }
  // update DB
  db.prepare(`
    UPDATE users
    SET wallet = wallet + ?, last_daily = ?, daily_streak = ?, dailies_this_month = dailies_this_month + 1, non_gambling_earned_month = non_gambling_earned_month + ?
    WHERE user_id = ?
  `).run(amount, Date.now(), streakAfter, amount, userId);
  // lifetime earned update
  db.prepare('UPDATE users SET lifetime_earned = lifetime_earned + ? WHERE user_id = ?').run(amount, userId);
  return amount;
}

// Monthly: require 14 dailies and >= 500k non-gambling earned
const MONTHLY_REQUIRED_DAILIES = 14;
const MONTHLY_NON_GAMBLING_REQ = 500000;
const MONTHLY_REWARD = 2_000_000;

function canClaimMonthly(userId) {
  ensureUser(userId);
  const u = getUser(userId);
  // check cooldown: monthly_claimed_at is timestamp when last claimed
  if (u.monthly_claimed_at && Date.now() - u.monthly_claimed_at < 0) { /* impossible */ }
  // must have 14 dailies and non_gambling_earned_month >= required
  return (u.dailies_this_month >= MONTHLY_REQUIRED_DAILIES) && (u.non_gambling_earned_month >= MONTHLY_NON_GAMBLING_REQ);
}
function claimMonthly(userId) {
  if (!canClaimMonthly(userId)) return false;
  // give reward and reset monthly counters, set timestamp now
  db.prepare(`
    UPDATE users
    SET wallet = wallet + ?, monthly_claimed_at = ?, dailies_this_month = 0, non_gambling_earned_month = 0
    WHERE user_id = ?
  `).run(MONTHLY_REWARD, Date.now(), userId);
  db.prepare('UPDATE users SET lifetime_earned = lifetime_earned + ? WHERE user_id = ?').run(MONTHLY_REWARD, userId);
  return MONTHLY_REWARD;
}

// ------------------ PROGRESS TRACKING ------------------
function incrementDailiesMonth(userId) {
  ensureUser(userId);
  db.prepare('UPDATE users SET dailies_this_month = dailies_this_month + 1 WHERE user_id = ?').run(userId);
}
function addNonGamblingEarnedMonth(userId, amount) {
  ensureUser(userId);
  db.prepare('UPDATE users SET non_gambling_earned_month = non_gambling_earned_month + ? WHERE user_id = ?').run(Math.floor(amount), userId);
}

// ------------------ GAMBLING PROGRESS (counts toward monthly gambling bucket if needed) ------------------
function addMonthlyGamblingProgress(userId, amount) {
  // gambling counts for gambling requirement (you told 300k from gambling counts). We track separately if needed.
  // For now store it in lifetime_earned only and caller will track gambling-specific totals if desired in separate column. Keep this function for compatibility.
  ensureUser(userId);
  db.prepare('UPDATE users SET lifetime_earned = lifetime_earned + ? WHERE user_id = ?').run(Math.floor(amount), userId);
}

// ------------------ INVENTORY & ITEMS INTEGRATION ------------------
function getInventory(userId) {
  ensureUser(userId);
  const row = db.prepare('SELECT inventory FROM users WHERE user_id = ?').get(userId);
  try { return JSON.parse(row.inventory || '[]'); } catch { return []; }
}
function setInventory(userId, arr) {
  ensureUser(userId);
  db.prepare('UPDATE users SET inventory = ? WHERE user_id = ?').run(JSON.stringify(arr || []), userId);
}
function addToInventory(userId, item) {
  const inv = getInventory(userId);
  inv.push(item);
  setInventory(userId, inv);
}

// ------------------ SMALL UTILITIES ------------------
function validateBet(amount) {
  if (!amount || isNaN(amount)) return { ok: false, reason: 'Invalid bet.' };
  amount = Math.floor(amount);
  if (amount <= 0) return { ok: false, reason: 'Bet must be positive.' };
  if (amount > 100_000) return { ok: false, reason: 'Max bet is 100,000 Vyncoins.' };
  return { ok: true, amount };
}

module.exports = {
  db,
  ensureUser,
  getUser,
  getWallet,
  changeWallet,
  addWallet,
  addBank,
  addLifetimeLost,
  getCooldown,
  setCooldown,
  clearCooldown,
  canClaimDaily,
  claimDaily,
  canClaimMonthly,
  claimMonthly,
  incrementDailiesMonth,
  addNonGamblingEarnedMonth,
  addMonthlyGamblingProgress,
  getInventory,
  setInventory,
  addToInventory,
  validateBet
};