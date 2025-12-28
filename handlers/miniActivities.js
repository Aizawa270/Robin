// handlers/miniActivities.js
const econ = require('./economy');
const items = require('./items');

// helper: simple roll
function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
  if (!ts) return 0;
  const now = Date.now();
  return Math.max(0, ts - now);
}
function setCooldown(userId, key, msFromNow) {
  econ.ensureUser(userId);
  const row = econ.getUser(userId);
  const cooldowns = _readCooldownsRow(row);
  cooldowns[key] = Date.now() + msFromNow;
  econ.db.prepare('UPDATE users SET cooldowns = ? WHERE user_id = ?').run(JSON.stringify(cooldowns), userId);
}
function clearCooldown(userId, key) {
  econ.ensureUser(userId);
  const row = econ.getUser(userId);
  const cooldowns = _readCooldownsRow(row);
  delete cooldowns[key];
  econ.db.prepare('UPDATE users SET cooldowns = ? WHERE user_id = ?').run(JSON.stringify(cooldowns), userId);
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
    else if (e.startsWith('job_bonus_')) {
      const n = parseInt(e.split('_').pop()) || 0;
      flatPercent += n;
    } else if (e === 'risky_job') risky = true;
    else if (e === 'negate_loss') negateLoss = true;
    else if (e === 'guarantee_win') guaranteeWin = true;
  }
  return { multiplier, flatPercent, risky, negateLoss, guaranteeWin };
}

// ---- item drop logic ----
function rollRarity() {
  const r = Math.random() * 100;
  if (r < 1) return 'legendary';
  if (r < 6) return 'rare';
  if (r < 16) return 'epic';
  if (r < 46) return 'uncommon';
  return 'common';
}

function getRandomItemByRarity(rarity) {
  const all = items.listMasterItems().filter(it => (it.rarity || 'common').toLowerCase() === rarity);
  if (!all.length) return null;
  return all[roll(0, all.length - 1)];
}

// ---- core activity reward wrapper ----
async function runActivity({ userId, baseMin, baseMax, econDb, activityKey, baseCooldownMs, specialFailureCooldownMs = 0, nothingChance = 0.05, allowItemDrop = true }) {
  econ.ensureUser(userId);

  const cd = getCooldown(userId, activityKey);
  if (cd > 0) return { ok: false, reason: 'cooldown', remaining: cd };

  const didNothing = Math.random() < nothingChance;
  if (didNothing) {
    setCooldown(userId, activityKey, baseCooldownMs + specialFailureCooldownMs);
    return { ok: true, coins: 0, nothing: true, appliedCooldownMs: baseCooldownMs + specialFailureCooldownMs };
  }

  const effects = collectItemEffects(userId);

  let total = Math.floor(roll(baseMin, baseMax) * effects.multiplier + Math.floor(baseMin * (effects.flatPercent / 100)));
  total = Math.max(0, total);

  if (total > 0) {
    econ.addWallet(userId, total);
    econ.addLifetimeEarned(userId, total);
    econ.addNonGamblingEarnedMonth(userId, total);
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

  setCooldown(userId, activityKey, baseCooldownMs);

  return { ok: true, coins: total, effects, droppedItem };
}

module.exports = {
  getCooldown: (userId, key) => getCooldown(userId, key),
  setCooldown: (userId, key, ms) => setCooldown(userId, key, ms),

  async find(userId) {
    return runActivity({
      userId,
      baseMin: 2000,
      baseMax: 15000,
      econDb: econ.db,
      activityKey: 'find',
      baseCooldownMs: 5 * 60 * 1000,
      specialFailureCooldownMs: 15 * 60 * 1000,
      nothingChance: 0.08,
      allowItemDrop: true
    });
  },

  async beg(userId) {
    return runActivity({
      userId,
      baseMin: 100,
      baseMax: 5000,
      econDb: econ.db,
      activityKey: 'beg',
      baseCooldownMs: 2 * 60 * 1000,
      nothingChance: 0.2,
      allowItemDrop: true
    });
  },

  async explore(userId) {
    return runActivity({
      userId,
      baseMin: 8000,
      baseMax: 25000,
      econDb: econ.db,
      activityKey: 'explore',
      baseCooldownMs: 10 * 60 * 1000,
      specialFailureCooldownMs: 15 * 60 * 1000,
      nothingChance: 0.12,
      allowItemDrop: true
    });
  },

  applyExtraPenalty(userId, key, extraMs) {
    setCooldown(userId, key, getCooldown(userId, key) + extraMs);
  },

  _internal: { collectItemEffects }
};