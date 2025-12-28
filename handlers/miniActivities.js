// handlers/miniActivities.js
const { roll } = require('./helpers'); // simple roll helper
const econ = require('./economy');
const items = require('./items');

// ---- cooldown helpers ----
function _readCooldownsRow(userRow) {
  try {
    return userRow?.cooldowns ? JSON.parse(userRow.cooldowns) : {};
  } catch {
    return {};
  }
}

function getCooldown(userId, key) {
  econ.ensureUser(userId);
  const row = econ.getUser(userId);
  const cooldowns = _readCooldownsRow(row);
  const ts = cooldowns[key];
  return ts ? Math.max(0, ts - Date.now()) : 0;
}

function setCooldown(userId, key, msFromNow) {
  econ.ensureUser(userId);
  const row = econ.getUser(userId);
  const cooldowns = _readCooldownsRow(row);
  cooldowns[key] = Date.now() + msFromNow;
  econ.db.prepare('UPDATE users SET cooldowns=? WHERE user_id=?').run(JSON.stringify(cooldowns), userId);
}

// ---- item effect collector ----
function collectItemEffects(userId) {
  const inv = items.getInventory(userId) || [];
  let multiplier = 1;
  let flatPercent = 0;
  let risky = false;
  let negateLoss = false;
  let guaranteeWin = false;

  for (const it of inv) {
    const e = (it.effect || '').toString();
    if (!e) continue;
    if (e === 'double_work') multiplier *= 2;
    else if (e.startsWith('job_bonus_')) flatPercent += parseInt(e.split('_').pop()) || 0;
    else if (e === 'risky_job') risky = true;
    else if (e === 'negate_loss') negateLoss = true;
    else if (e === 'guarantee_win') guaranteeWin = true;
  }

  return { multiplier, flatPercent, risky, negateLoss, guaranteeWin };
}

// ---- item drop logic ----
function rollRarity() {
  const r = Math.random() * 100;
  if (r < 1) return 'legendary';  // 1% legendary
  if (r < 6) return 'rare';       // 5% rare
  if (r < 16) return 'epic';      // 10% epic
  if (r < 46) return 'uncommon';  // 30% uncommon
  return 'common';                // 54% common
}

function getRandomItemByRarity(rarity) {
  const all = items.listMasterItems().filter(it => (it.rarity || 'common').toLowerCase() === rarity);
  return all.length ? all[roll(0, all.length - 1)] : null;
}

// ---- activity runner ----
async function runActivity({ userId, minCoins, maxCoins, key, cooldownMs, nothingChance = 0.05, allowItemDrop = true }) {
  econ.ensureUser(userId);

  const cd = getCooldown(userId, key);
  if (cd > 0) return { ok: false, reason: 'cooldown', remaining: cd };

  const didNothing = Math.random() < nothingChance;
  if (didNothing) {
    setCooldown(userId, key, cooldownMs);
    return { ok: true, coins: 0, nothing: true, appliedCooldownMs: cooldownMs };
  }

  const effects = collectItemEffects(userId);

  let total = Math.floor(roll(minCoins, maxCoins) * effects.multiplier + Math.floor(minCoins * (effects.flatPercent / 100)));
  total = Math.max(0, total);

  if (total > 0) {
    econ.addWallet(userId, total);
    // optional: if you track lifetime/non-gamble, implement these
    if (typeof econ.addLifetimeEarned === 'function') econ.addLifetimeEarned(userId, total);
    if (typeof econ.addNonGamblingEarnedMonth === 'function') econ.addNonGamblingEarnedMonth(userId, total);
  }

  let droppedItem = null;
  if (allowItemDrop) {
    const rarity = rollRarity();
    const it = getRandomItemByRarity(rarity);
    if (it) {
      items.addItem(userId, it.id, 1);
      droppedItem = it;
    }
  }

  setCooldown(userId, key, cooldownMs);
  return { ok: true, coins: total, effects, droppedItem };
}

module.exports = {
  getCooldown,
  setCooldown,

  async find(userId) {
    return runActivity({
      userId,
      minCoins: 2000,
      maxCoins: 15000,
      key: 'find',
      cooldownMs: 5 * 60 * 1000,
      nothingChance: 0.08
    });
  },

  async beg(userId) {
    return runActivity({
      userId,
      minCoins: 100,
      maxCoins: 5000,
      key: 'beg',
      cooldownMs: 2 * 60 * 1000,
      nothingChance: 0.2
    });
  },

  async explore(userId) {
    return runActivity({
      userId,
      minCoins: 8000,
      maxCoins: 25000,
      key: 'explore',
      cooldownMs: 10 * 60 * 1000,
      nothingChance: 0.12
    });
  }
};