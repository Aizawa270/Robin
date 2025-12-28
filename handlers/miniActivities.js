// handlers/miniActivities.js
const econ = require('./economy');
const items = require('./items');

// helper: simple roll
function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---- cooldown helpers (store in users.cooldowns JSON column) ----
function _readCooldownsRow(userRow) {
  try {
    return userRow?.cooldowns ? JSON.parse(userRow.cooldowns) : {};
  } catch {
    return {};
  }
}
function getCooldown(econDb, userId, key) {
  econ.ensureUser(userId);
  const row = econ.getUser(userId);
  const cooldowns = _readCooldownsRow(row);
  const ts = cooldowns[key];
  if (!ts) return 0;
  const now = Date.now();
  return Math.max(0, ts - now);
}
function setCooldown(econDb, userId, key, msFromNow) {
  econ.ensureUser(userId);
  const row = econ.getUser(userId);
  const cooldowns = _readCooldownsRow(row);
  cooldowns[key] = Date.now() + msFromNow;
  econDb.prepare('UPDATE users SET cooldowns = ? WHERE user_id = ?').run(JSON.stringify(cooldowns), userId);
}
function clearCooldown(econDb, userId, key) {
  econ.ensureUser(userId);
  const row = econ.getUser(userId);
  const cooldowns = _readCooldownsRow(row);
  delete cooldowns[key];
  econDb.prepare('UPDATE users SET cooldowns = ? WHERE user_id = ?').run(JSON.stringify(cooldowns), userId);
}

// ---- item effect collector ----
// reads user's inventory and aggregates simple effects we support here.
// returns { multiplier, flatPercent, riskyFlag, negateNextLossFlag, guaranteeNextWinFlag }
function collectItemEffects(userId) {
  const inv = items.getInventory(userId) || [];
  let multiplier = 1;
  let flatPercent = 0;
  let risky = false;
  let negateLoss = false;
  let guaranteeWin = false;
  // iterate master item rows (they have .effect)
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
    // you can expand mapping here
  }

  return { multiplier, flatPercent, risky, negateLoss, guaranteeWin };
}

// ---- core activity reward wrapper ----
// baseMin/baseMax = base reward range
// activityKey = 'find' | 'beg' | 'explore' used for cooldown storage
// specialFailureCooldownMs = additional penalty (ms) applied when the activity yields "nothing"
async function runActivity({ userId, baseMin, baseMax, econDb, activityKey, baseCooldownMs, specialFailureCooldownMs = 0, nothingChance = 0.05 }) {
  econ.ensureUser(userId);

  // Check cooldown (caller should have checked already but double-check here)
  const cd = getCooldown(econDb, userId, activityKey);
  if (cd > 0) return { ok: false, reason: 'cooldown', remaining: cd };

  // Determine nothing outcome first
  const didNothing = Math.random() < nothingChance; // small chance to get nothing
  if (didNothing) {
    // apply standard cooldown + special penalty if provided
    setCooldown(econDb, userId, activityKey, baseCooldownMs + specialFailureCooldownMs);
    // also apply penalty to explore/find pair if requested by caller (caller may call applyExtra)
    return { ok: true, coins: 0, nothing: true, appliedCooldownMs: baseCooldownMs + specialFailureCooldownMs };
  }

  // collect item effects
  const effects = collectItemEffects(userId);

  // base roll
  const base = roll(baseMin, baseMax);

  // apply multiplier and percent
  let total = Math.floor(base * effects.multiplier + Math.floor(base * (effects.flatPercent / 100)));

  // small randomized variation
  const variance = Math.floor(total * (Math.random() * 0.08)); // up to ~8% variance
  total = total + (Math.random() < 0.5 ? -variance : variance);

  // floor to 0 minimum
  total = Math.max(0, Math.floor(total));

  // credit economy
  if (total > 0) {
    econ.addWallet(userId, total);
    econ.addLifetimeEarned(userId, total);
    econ.addNonGamblingEarnedMonth(userId, total);
  }

  // set cooldown
  setCooldown(econDb, userId, activityKey, baseCooldownMs);

  return { ok: true, coins: total, effects };
}

module.exports = {
  // external helpers
  getCooldown: (userId, key) => getCooldown(econ.db, userId, key),
  setCooldown: (userId, key, ms) => setCooldown(econ.db, userId, key, ms),
  // activities
  async find(userId) {
    // find: base 2k - 15k. base cooldown 5min. nothing chance 8%. special failure penalty 15min.
    return runActivity({
      userId,
      baseMin: 2000,
      baseMax: 15000,
      econDb: econ.db,
      activityKey: 'find',
      baseCooldownMs: 5 * 60 * 1000,
      specialFailureCooldownMs: 15 * 60 * 1000,
      nothingChance: 0.08
    });
  },

  async beg(userId) {
    // beg: base 100 - 5k (rare). base cooldown 2min. nothing chance 20% (more likely to get small amount)
    return runActivity({
      userId,
      baseMin: 100,
      baseMax: 5000,
      econDb: econ.db,
      activityKey: 'beg',
      baseCooldownMs: 2 * 60 * 1000,
      specialFailureCooldownMs: 0,
      nothingChance: 0.2
    });
  },

  async explore(userId) {
    // explore: base 8k - 25k. base cooldown 10min. nothing chance 12%. special failure penalty 15min.
    return runActivity({
      userId,
      baseMin: 8000,
      baseMax: 25000,
      econDb: econ.db,
      activityKey: 'explore',
      baseCooldownMs: 10 * 60 * 1000,
      specialFailureCooldownMs: 15 * 60 * 1000,
      nothingChance: 0.12
    });
  },

  // apply extra cross-penalty (if find yields nothing, caller may want to also extend explore cooldown)
  applyExtraPenalty(userId, key, extraMs) {
    setCooldown(econ.db, userId, key, getCooldown(econ.db, userId, key) + extraMs);
  },

  // expose read access for commands
  _internal: {
    readCooldownsRow: _readCooldownsRow,
    collectItemEffects
  }
};