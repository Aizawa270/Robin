// handlers/gamblingHelper.js
const econ = require('./economy');

const COOLDOWNS = new Map();
const DEFAULT_CD = 15_000;
const MAX_BET = 100_000;

function now() {
  return Date.now();
}

// ---------- Cooldowns ----------
function getCooldown(userId, cmd) {
  const key = `${userId}:${cmd}`;
  const expires = COOLDOWNS.get(key) || 0;
  return Math.max(0, expires - now());
}

function setCooldown(userId, cmd, ms = DEFAULT_CD) {
  const key = `${userId}:${cmd}`;
  COOLDOWNS.set(key, now() + ms);
}

// ---------- Bets ----------
function validateBet(bet) {
  if (!Number.isInteger(bet) || bet <= 0) {
    return { ok: false, reason: 'Bet must be a positive number.' };
  }
  if (bet > MAX_BET) {
    return { ok: false, reason: `Max bet is ${MAX_BET}.` };
  }
  return { ok: true, amount: bet };
}

// ---------- Wallet ----------
function getWallet(_client, userId) {
  econ.ensureUser(userId);
  return econ.getUser(userId).wallet;
}

function changeWallet(_client, userId, delta) {
  econ.ensureUser(userId);
  econ.addWallet(userId, delta);
}

// ---------- Monthly ----------
function addMonthlyGamblingProgress(_client, userId, amount) {
  // Gambling DOES count to monthly (you confirmed)
  econ.addNonGamblingEarnedMonth(userId, amount);
}

// ---------- Exports ----------
module.exports = {
  getCooldown,
  setCooldown,
  validateBet,
  getWallet,
  changeWallet,
  addMonthlyGamblingProgress
};