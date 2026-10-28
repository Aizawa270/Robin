'use strict';

// ============================================================
// FARM SERVICE
// All game rules and database work. Everything that changes
// money, items or progress runs inside ONE database transaction
// on economy.sqlite (the same database as the wallet), so a
// purchase/sale can never half-complete or be duplicated.
// ============================================================

const { randomInt } = require('crypto');
const economy = require('./economy');
const CFG = require('./farmConfig');
const { emoji, seedEmoji } = require('./farmEmojis');

const db = economy.db;

class FarmError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FarmError';
  }
}

// ------------------------------------------------------------
// Schema (all CREATE IF NOT EXISTS - existing data is untouched)
// ------------------------------------------------------------

db.exec(`
CREATE TABLE IF NOT EXISTS farm_players (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  plots INTEGER NOT NULL DEFAULT 3,
  expansion_tier INTEGER NOT NULL DEFAULT 0,
  can_tier INTEGER NOT NULL DEFAULT 1,
  hoe_tier INTEGER NOT NULL DEFAULT 0,
  crops_harvested INTEGER NOT NULL DEFAULT 0,
  plots_harvested INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  contracts_done INTEGER NOT NULL DEFAULT 0,
  quests_done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS farm_plots (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  plot_no INTEGER NOT NULL,
  crop_id TEXT NOT NULL,
  planted_at INTEGER NOT NULL,
  ready_at INTEGER NOT NULL,
  fert_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, plot_no)
);

CREATE TABLE IF NOT EXISTS farm_inventory (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (guild_id, user_id, item_id)
);

CREATE TABLE IF NOT EXISTS farm_decor (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  decor_id TEXT NOT NULL,
  bought_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, decor_id)
);

CREATE TABLE IF NOT EXISTS farm_quests (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  slot INTEGER NOT NULL,
  kind TEXT NOT NULL,
  crop_id TEXT,
  target INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, day_key, slot)
);

CREATE TABLE IF NOT EXISTS farm_quest_bonus (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, day_key)
);

CREATE TABLE IF NOT EXISTS farm_contracts (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  slot INTEGER NOT NULL,
  template_id TEXT NOT NULL,
  crop_id TEXT NOT NULL,
  target INTEGER NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, period_key, slot)
);

CREATE TABLE IF NOT EXISTS farm_achievements (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS farm_market (
  guild_id TEXT NOT NULL,
  crop_id TEXT NOT NULL,
  multiplier REAL NOT NULL DEFAULT 1,
  slot_no INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, crop_id)
);

CREATE TABLE IF NOT EXISTS farm_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  slot_no INTEGER NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  UNIQUE (guild_id, slot_no)
);

CREATE TABLE IF NOT EXISTS farm_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  act TEXT NOT NULL,
  detail TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);
`);

// ------------------------------------------------------------
// Lookups and small helpers
// ------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6, same as the economy

const cropMap = new Map(CFG.CROPS.map(c => [c.id, c]));
const fertMap = new Map(CFG.FERTILIZERS.map(f => [f.id, f]));
const decorMap = new Map(CFG.DECORATIONS.map(d => [d.id, d]));
const canByTier = new Map(CFG.WATERING_CANS.map(c => [c.tier, c]));
const hoeByTier = new Map(CFG.HOES.map(h => [h.tier, h]));
const eventMap = new Map(CFG.EVENTS.map(e => [e.id, e]));

const money = amount => economy.formatCurrency(amount);

function dayKey(ts) {
  const d = new Date(ts + TZ_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function periodKey(ts) {
  return String(Math.floor((ts + TZ_OFFSET_MS) / CFG.CONTRACT_PERIOD_MS));
}

const randInt = (min, max) => randomInt(min, max + 1);
const pick = arr => arr[randomInt(0, arr.length)];
const chance = p => randomInt(0, 1_000_000) < Math.floor(p * 1_000_000);

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function titleFor(level) {
  let title = CFG.TITLES[0].name;
  for (const t of CFG.TITLES) if (level >= t.level) title = t.name;
  return title;
}

// ------------------------------------------------------------
// Prepared statements
// ------------------------------------------------------------

const S = {
  insPlayer: db.prepare(`INSERT OR IGNORE INTO farm_players (guild_id, user_id, plots, created_at) VALUES (?, ?, ?, ?)`),
  getPlayer: db.prepare(`SELECT * FROM farm_players WHERE guild_id = ? AND user_id = ?`),
  setXp: db.prepare(`UPDATE farm_players SET level = ?, xp = ? WHERE guild_id = ? AND user_id = ?`),
  addEarned: db.prepare(`UPDATE farm_players SET total_earned = total_earned + ? WHERE guild_id = ? AND user_id = ?`),
  addSpent: db.prepare(`UPDATE farm_players SET total_spent = total_spent + ? WHERE guild_id = ? AND user_id = ?`),
  addHarvest: db.prepare(`UPDATE farm_players SET crops_harvested = crops_harvested + ?, plots_harvested = plots_harvested + ? WHERE guild_id = ? AND user_id = ?`),
  addQuestDone: db.prepare(`UPDATE farm_players SET quests_done = quests_done + 1 WHERE guild_id = ? AND user_id = ?`),
  addContractDone: db.prepare(`UPDATE farm_players SET contracts_done = contracts_done + 1 WHERE guild_id = ? AND user_id = ?`),
  setExpansion: db.prepare(`UPDATE farm_players SET plots = ?, expansion_tier = ? WHERE guild_id = ? AND user_id = ?`),
  setCan: db.prepare(`UPDATE farm_players SET can_tier = ? WHERE guild_id = ? AND user_id = ?`),
  setHoe: db.prepare(`UPDATE farm_players SET hoe_tier = ? WHERE guild_id = ? AND user_id = ?`),

  plots: db.prepare(`SELECT * FROM farm_plots WHERE guild_id = ? AND user_id = ? ORDER BY plot_no`),
  plotNos: db.prepare(`SELECT plot_no FROM farm_plots WHERE guild_id = ? AND user_id = ?`),
  getPlot: db.prepare(`SELECT * FROM farm_plots WHERE guild_id = ? AND user_id = ? AND plot_no = ?`),
  insPlot: db.prepare(`INSERT INTO farm_plots (guild_id, user_id, plot_no, crop_id, planted_at, ready_at) VALUES (?, ?, ?, ?, ?, ?)`),
  delPlot: db.prepare(`DELETE FROM farm_plots WHERE guild_id = ? AND user_id = ? AND plot_no = ?`),
  fertPlot: db.prepare(`UPDATE farm_plots SET ready_at = ?, fert_count = fert_count + 1 WHERE guild_id = ? AND user_id = ? AND plot_no = ?`),

  addItem: db.prepare(`INSERT INTO farm_inventory (guild_id, user_id, item_id, qty) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`),
  takeItem: db.prepare(`UPDATE farm_inventory SET qty = qty - ? WHERE guild_id = ? AND user_id = ? AND item_id = ? AND qty >= ?`),
  getItem: db.prepare(`SELECT qty FROM farm_inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?`),
  allItems: db.prepare(`SELECT item_id, qty FROM farm_inventory WHERE guild_id = ? AND user_id = ? AND qty > 0 ORDER BY item_id`),
  cleanItems: db.prepare(`DELETE FROM farm_inventory WHERE guild_id = ? AND user_id = ? AND qty <= 0`),

  getDecor: db.prepare(`SELECT decor_id FROM farm_decor WHERE guild_id = ? AND user_id = ? ORDER BY bought_at`),
  insDecor: db.prepare(`INSERT OR IGNORE INTO farm_decor (guild_id, user_id, decor_id, bought_at) VALUES (?, ?, ?, ?)`),

  getQuests: db.prepare(`SELECT * FROM farm_quests WHERE guild_id = ? AND user_id = ? AND day_key = ? ORDER BY slot`),
  insQuest: db.prepare(`INSERT OR IGNORE INTO farm_quests (guild_id, user_id, day_key, slot, kind, crop_id, target, reward_coins, reward_xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  setQuestProgress: db.prepare(`UPDATE farm_quests SET progress = ? WHERE guild_id = ? AND user_id = ? AND day_key = ? AND slot = ? AND done = 0`),
  finishQuest: db.prepare(`UPDATE farm_quests SET progress = target, done = 1 WHERE guild_id = ? AND user_id = ? AND day_key = ? AND slot = ? AND done = 0`),
  insQuestBonus: db.prepare(`INSERT OR IGNORE INTO farm_quest_bonus (guild_id, user_id, day_key, claimed_at) VALUES (?, ?, ?, ?)`),
  getQuestBonus: db.prepare(`SELECT 1 FROM farm_quest_bonus WHERE guild_id = ? AND user_id = ? AND day_key = ?`),

  getContracts: db.prepare(`SELECT * FROM farm_contracts WHERE guild_id = ? AND user_id = ? AND period_key = ? ORDER BY slot`),
  insContract: db.prepare(`INSERT OR IGNORE INTO farm_contracts (guild_id, user_id, period_key, slot, template_id, crop_id, target, reward_coins, reward_xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  getContract: db.prepare(`SELECT * FROM farm_contracts WHERE guild_id = ? AND user_id = ? AND period_key = ? AND slot = ?`),
  setContractDelivered: db.prepare(`UPDATE farm_contracts SET delivered = ? WHERE guild_id = ? AND user_id = ? AND period_key = ? AND slot = ? AND done = 0`),
  finishContract: db.prepare(`UPDATE farm_contracts SET delivered = target, done = 1 WHERE guild_id = ? AND user_id = ? AND period_key = ? AND slot = ? AND done = 0`),

  getAch: db.prepare(`SELECT achievement_id FROM farm_achievements WHERE guild_id = ? AND user_id = ?`),
  insAch: db.prepare(`INSERT OR IGNORE INTO farm_achievements (guild_id, user_id, achievement_id, claimed_at) VALUES (?, ?, ?, ?)`),

  marketSlot: db.prepare(`SELECT slot_no FROM farm_market WHERE guild_id = ? LIMIT 1`),
  marketAll: db.prepare(`SELECT crop_id, multiplier FROM farm_market WHERE guild_id = ?`),
  upsertMarket: db.prepare(`INSERT INTO farm_market (guild_id, crop_id, multiplier, slot_no) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, crop_id) DO UPDATE SET multiplier = excluded.multiplier, slot_no = excluded.slot_no`),
  insEvent: db.prepare(`INSERT OR IGNORE INTO farm_events (guild_id, slot_no, kind, detail, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)`),
  activeEvent: db.prepare(`SELECT * FROM farm_events WHERE guild_id = ? AND starts_at <= ? AND ends_at > ? ORDER BY starts_at DESC LIMIT 1`),

  insLog: db.prepare(`INSERT INTO farm_log (guild_id, user_id, act, detail, amount, ts) VALUES (?, ?, ?, ?, ?, ?)`),
};

function log(gid, uid, act, detail, amount, ts) {
  S.insLog.run(gid, uid, act, detail ? String(detail).slice(0, 300) : null, Math.floor(Number(amount) || 0), ts);
}

// ------------------------------------------------------------
// Inventory + wallet helpers (call these inside transactions)
// ------------------------------------------------------------

function addItem(gid, uid, key, qty) {
  qty = Math.floor(Number(qty));
  if (!Number.isSafeInteger(qty) || qty <= 0) return;
  S.addItem.run(gid, uid, key, qty);
}

function takeItem(gid, uid, key, qty, label) {
  qty = Math.floor(Number(qty));
  if (!Number.isSafeInteger(qty) || qty <= 0) throw new FarmError('Invalid amount.');
  const res = S.takeItem.run(qty, gid, uid, key, qty);
  if (res.changes === 0) {
    throw new FarmError(`You do not have enough ${label || 'items'}.`);
  }
  S.cleanItems.run(gid, uid);
}

function getQty(gid, uid, key) {
  return S.getItem.get(gid, uid, key)?.qty || 0;
}

function charge(gid, uid, amount, type, reason, now) {
  amount = Math.floor(Number(amount));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new FarmError('Invalid price.');

  const res = economy.removeCrowns(gid, uid, amount, { type, reason, actorId: uid, timestamp: now });
  if (!res) {
    throw new FarmError(`You need ${money(amount)} for that, but you only have ${money(economy.getBalance(gid, uid))}.`);
  }
  S.addSpent.run(amount, gid, uid);
}

function pay(gid, uid, amount, type, reason, now) {
  amount = Math.floor(Number(amount));
  if (!Number.isSafeInteger(amount) || amount <= 0) return;
  economy.addCrowns(gid, uid, amount, { type, reason, actorId: uid, timestamp: now });
  S.addEarned.run(amount, gid, uid);
}

// ------------------------------------------------------------
// Players
// ------------------------------------------------------------

const openFarmTx = db.transaction((gid, uid, now) => {
  const res = S.insPlayer.run(gid, uid, CFG.EXPANSIONS[0].plots, now);
  let created = false;
  let grant = 0;

  if (res.changes === 1) {
    created = true;

    for (const [cropId, qty] of Object.entries(CFG.START_SEEDS)) {
      addItem(gid, uid, `seed:${cropId}`, qty);
    }

    if (CFG.STARTING_GRANT > 0) {
      economy.addCrowns(gid, uid, CFG.STARTING_GRANT, {
        type: 'farm_start_grant',
        reason: 'Farm starter grant',
        actorId: uid,
        timestamp: now,
      });
      grant = CFG.STARTING_GRANT;
    }

    log(gid, uid, 'start', 'Farm created', grant, now);
  }

  return { created, grant };
});

function openFarm(gid, uid, now = Date.now()) {
  gid = String(gid);
  uid = String(uid);
  const { created, grant } = openFarmTx(gid, uid, now);
  return { created, grant, player: S.getPlayer.get(gid, uid) };
}

function hasFarm(gid, uid) {
  return !!S.getPlayer.get(String(gid), String(uid));
}

// Adds XP, handles level ups. notes.levelUps collects results.
function addXp(gid, uid, amount, notes) {
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  if (amount <= 0) return;

  const p = S.getPlayer.get(gid, uid);
  let level = p.level;
  let xp = p.xp + amount;

  const gained = [];
  while (level < CFG.MAX_LEVEL && xp >= CFG.xpToNext(level)) {
    xp -= CFG.xpToNext(level);
    level += 1;
    gained.push(level);
  }

  S.setXp.run(level, xp, gid, uid);
  if (notes) {
    notes.xp = (notes.xp || 0) + amount;
    for (const lvl of gained) {
      notes.levelUps = notes.levelUps || [];
      notes.levelUps.push({ level: lvl, unlocks: unlocksAt(lvl) });
    }
  }
}

function unlocksAt(level) {
  const names = [];
  for (const c of CFG.CROPS) if (c.level === level && level > 1) names.push(c.name);
  for (const t of CFG.WATERING_CANS) if (t.level === level && level > 1) names.push(t.name);
  for (const t of CFG.HOES) if (t.level === level) names.push(t.name);
  for (const f of CFG.FERTILIZERS) if (f.level === level && level > 1) names.push(f.name);
  for (const d of CFG.DECORATIONS) if (d.level === level && level > 1) names.push(d.name);
  return names;
}

// ------------------------------------------------------------
// Market and events
// ------------------------------------------------------------

function tickMarket(gid, now) {
  const slot = Math.floor(now / CFG.MARKET_INTERVAL_MS);
  const row = S.marketSlot.get(gid);
  if (row && row.slot_no === slot) return;

  db.transaction(() => {
    const span = CFG.MARKET_MAX - CFG.MARKET_MIN;
    for (const crop of CFG.CROPS) {
      // Average of two rolls keeps most prices near 100%.
      const r = (randomInt(0, 10001) + randomInt(0, 10001)) / 20000;
      const mult = Math.round((CFG.MARKET_MIN + span * r) * 100) / 100;
      S.upsertMarket.run(gid, crop.id, mult, slot);
    }

    if (chance(CFG.EVENT_CHANCE)) {
      const ev = pick(CFG.EVENTS);
      let detail = {};
      if (ev.id === 'market_boom') {
        detail = { crops: shuffle(CFG.CROPS).slice(0, ev.boostCount).map(c => c.id) };
      }
      // UNIQUE(guild_id, slot_no) means one recorded event per update.
      S.insEvent.run(gid, slot, ev.id, JSON.stringify(detail), now, now + ev.durationMs);
    }
  })();
}

function getMarket(gid, now = Date.now()) {
  gid = String(gid);
  tickMarket(gid, now);

  const mult = {};
  for (const r of S.marketAll.all(gid)) mult[r.crop_id] = r.multiplier;

  let event = null;
  const row = S.activeEvent.get(gid, now, now);
  if (row) {
    const def = eventMap.get(row.kind);
    if (def) {
      let detail = {};
      try { detail = JSON.parse(row.detail || '{}'); } catch { detail = {}; }
      event = { ...def, detail, startsAt: row.starts_at, endsAt: row.ends_at };
    }
  }

  const slot = Math.floor(now / CFG.MARKET_INTERVAL_MS);
  return { mult, event, nextUpdateAt: (slot + 1) * CFG.MARKET_INTERVAL_MS };
}

function unitPrice(crop, market) {
  let m = market.mult[crop.id] || 1;
  if (market.event?.id === 'market_boom' && market.event.detail?.crops?.includes(crop.id)) {
    m *= market.event.boostMult;
  }
  return Math.max(1, Math.round(crop.price * m));
}

// ------------------------------------------------------------
// Quests
// ------------------------------------------------------------

const avgYield = c => (c.yield[0] + c.yield[1]) / 2;

function buildQuests(level) {
  const eligible = CFG.CROPS.filter(c => c.level <= level);
  const targetValue = 120 + level * 30;
  const quests = [];
  const usedCrops = new Set();

  const cropQuest = () => {
    const pool = eligible.filter(c => !usedCrops.has(c.id));
    const crop = pick(pool.length ? pool : eligible);
    usedCrops.add(crop.id);
    const units = Math.min(60, Math.max(4, Math.round(targetValue / crop.price)));
    return {
      kind: 'harvest_crop',
      crop_id: crop.id,
      target: units,
      coins: Math.round(units * crop.price * 0.7),
      xp: Math.round((units / avgYield(crop)) * crop.xp * 0.5) + 10,
    };
  };

  quests.push(cropQuest());

  const plotsN = Math.min(15, 2 + Math.floor(level / 3));
  quests.push({
    kind: 'harvest_plots',
    crop_id: null,
    target: plotsN,
    coins: plotsN * (30 + level * 6),
    xp: plotsN * 12,
  });

  const roll = randomInt(0, 3);
  if (roll === 0) {
    quests.push(cropQuest());
  } else if (roll === 1) {
    const n = 10 + level * 2;
    quests.push({ kind: 'sell_any', crop_id: null, target: n, coins: n * 6, xp: Math.round(n * 1.5) });
  } else {
    const n = Math.min(12, 3 + Math.floor(level / 3));
    quests.push({ kind: 'plant_any', crop_id: null, target: n, coins: n * (20 + level * 4), xp: n * 8 });
  }

  return quests.slice(0, CFG.DAILY_QUEST_COUNT);
}

function ensureQuests(gid, uid, now) {
  const dk = dayKey(now);
  let rows = S.getQuests.all(gid, uid, dk);
  if (rows.length) return rows;

  const p = S.getPlayer.get(gid, uid);
  buildQuests(p.level).forEach((q, i) => {
    S.insQuest.run(gid, uid, dk, i, q.kind, q.crop_id, q.target, q.coins, q.xp);
  });

  rows = S.getQuests.all(gid, uid, dk);
  return rows;
}

function questText(q) {
  switch (q.kind) {
    case 'harvest_crop': return `Harvest ${q.target} ${cropMap.get(q.crop_id)?.name || 'produce'}`;
    case 'harvest_plots': return `Harvest ${q.target} plots`;
    case 'plant_any': return `Plant ${q.target} plots`;
    case 'sell_any': return `Sell ${q.target} produce`;
    default: return 'Quest';
  }
}

// Adds progress to today's quests and pays rewards exactly once.
function bumpQuests(gid, uid, kind, cropId, amount, now, notes) {
  amount = Math.floor(Number(amount));
  if (!Number.isSafeInteger(amount) || amount <= 0) return;

  const dk = dayKey(now);
  const rows = ensureQuests(gid, uid, now);

  for (const q of rows) {
    if (q.done || q.kind !== kind) continue;
    if (kind === 'harvest_crop' && q.crop_id !== cropId) continue;

    const next = Math.min(q.target, q.progress + amount);

    if (next < q.target) {
      S.setQuestProgress.run(next, gid, uid, dk, q.slot);
      continue;
    }

    // Guarded by "done = 0": the reward can only be paid once.
    const res = S.finishQuest.run(gid, uid, dk, q.slot);
    if (res.changes === 1) {
      pay(gid, uid, q.reward_coins, 'farm_quest', `Farm quest: ${questText(q)}`, now);
      addXp(gid, uid, q.reward_xp, notes);
      S.addQuestDone.run(gid, uid);
      notes.quests = notes.quests || [];
      notes.quests.push({ text: questText(q), coins: q.reward_coins, xp: q.reward_xp });
    }
  }

  // Bonus for finishing every quest of the day.
  const fresh = S.getQuests.all(gid, uid, dk);
  if (fresh.length && fresh.every(q => q.done)) {
    const res = S.insQuestBonus.run(gid, uid, dk, now);
    if (res.changes === 1) {
      const p = S.getPlayer.get(gid, uid);
      const coins = CFG.QUEST_BONUS_COINS + p.level * 25;
      pay(gid, uid, coins, 'farm_quest_bonus', 'Farm daily quest bonus', now);
      addXp(gid, uid, CFG.QUEST_BONUS_XP, notes);
      notes.questBonus = { coins, xp: CFG.QUEST_BONUS_XP };
    }
  }
}

// ------------------------------------------------------------
// Contracts
// ------------------------------------------------------------

function ensureContracts(gid, uid, now) {
  const pk = periodKey(now);
  let rows = S.getContracts.all(gid, uid, pk);
  if (rows.length) return rows;

  const p = S.getPlayer.get(gid, uid);
  const eligible = CFG.CONTRACTS.filter(c => c.level <= p.level);

  // Prefer the highest-tier contracts the player can access, but mix tiers.
  const chosen = shuffle(eligible).slice(0, CFG.CONTRACT_SLOTS);

  chosen.forEach((tpl, i) => {
    const crop = cropMap.get(tpl.crop);
    const qty = randInt(tpl.qty[0], tpl.qty[1]);
    const coins = Math.round(qty * crop.price * CFG.CONTRACT_REWARD_MULT);
    const xp = Math.round(qty * crop.xp * 0.4);
    S.insContract.run(gid, uid, pk, i, tpl.id, tpl.crop, qty, coins, xp);
  });

  rows = S.getContracts.all(gid, uid, pk);
  return rows;
}

function contractClient(row) {
  return CFG.CONTRACTS.find(c => c.id === row.template_id)?.client || 'a buyer';
}

const deliverTx = db.transaction((gid, uid, slot, now) => {
  openFarmTx(gid, uid, now);
  ensureContracts(gid, uid, now);

  const pk = periodKey(now);
  const row = S.getContract.get(gid, uid, pk, slot);
  if (!row) throw new FarmError('There is no contract with that number.');
  if (row.done) throw new FarmError('That contract is already complete.');

  const crop = cropMap.get(row.crop_id);
  const need = row.target - row.delivered;
  const have = getQty(gid, uid, `crop:${crop.id}`);
  const give = Math.min(need, have);

  if (give <= 0) {
    throw new FarmError(`You need ${crop.name} to deliver. Harvest some first.`);
  }

  takeItem(gid, uid, `crop:${crop.id}`, give, crop.name);

  const notes = {};
  const newDelivered = row.delivered + give;
  let completed = false;

  if (newDelivered >= row.target) {
    const res = S.finishContract.run(gid, uid, pk, slot);
    if (res.changes === 1) {
      completed = true;
      pay(gid, uid, row.reward_coins, 'farm_contract', `Contract for ${contractClient(row)}`, now);
      addXp(gid, uid, row.reward_xp, notes);
      S.addContractDone.run(gid, uid);
    }
  } else {
    S.setContractDelivered.run(newDelivered, gid, uid, pk, slot);
  }

  if (completed) checkAchievements(gid, uid, now, notes);
  log(gid, uid, 'deliver', `${give} ${crop.id} (slot ${slot})`, completed ? row.reward_coins : 0, now);

  return {
    crop,
    delivered: give,
    total: newDelivered,
    target: row.target,
    completed,
    coins: completed ? row.reward_coins : 0,
    xp: completed ? row.reward_xp : 0,
    client: contractClient(row),
    notes,
  };
});

function deliver(gid, uid, slotNumber) {
  const slot = Math.floor(Number(slotNumber)) - 1;
  if (!Number.isInteger(slot) || slot < 0) throw new FarmError('Use a contract number, for example `deliver 1`.');
  return deliverTx(String(gid), String(uid), slot, Date.now());
}

// ------------------------------------------------------------
// Achievements
// ------------------------------------------------------------

function statValue(p, stat) {
  return Number(p[stat] || 0);
}

function checkAchievements(gid, uid, now, notes) {
  // XP from an achievement can level the player up and unlock another one.
  for (let pass = 0; pass < 3; pass++) {
    const p = S.getPlayer.get(gid, uid);
    let granted = false;

    for (const a of CFG.ACHIEVEMENTS) {
      if (statValue(p, a.stat) < a.min) continue;

      const res = S.insAch.run(gid, uid, a.id, now);
      if (res.changes !== 1) continue;

      granted = true;
      pay(gid, uid, a.coins, 'farm_achievement', `Achievement: ${a.name}`, now);
      addXp(gid, uid, a.xp, notes);
      notes.achievements = notes.achievements || [];
      notes.achievements.push({ name: a.name, coins: a.coins, xp: a.xp, title: a.title || null });
    }

    if (!granted) break;
  }
}

// ------------------------------------------------------------
// Plot views
// ------------------------------------------------------------

function getPlots(gid, uid, now = Date.now()) {
  gid = String(gid);
  uid = String(uid);
  const p = S.getPlayer.get(gid, uid);
  if (!p) return [];

  const byNo = new Map(S.plots.all(gid, uid).map(r => [r.plot_no, r]));
  const out = [];

  for (let n = 1; n <= p.plots; n++) {
    const r = byNo.get(n);
    if (!r) {
      out.push({ plotNo: n, empty: true });
      continue;
    }
    const crop = cropMap.get(r.crop_id);
    const total = Math.max(1, r.ready_at - r.planted_at);
    const done = Math.min(total, Math.max(0, now - r.planted_at));
    out.push({
      plotNo: n,
      empty: false,
      cropId: r.crop_id,
      name: crop?.name || r.crop_id,
      ready: now >= r.ready_at,
      pct: now >= r.ready_at ? 100 : Math.floor((done / total) * 100),
      remainingMs: Math.max(0, r.ready_at - now),
      fertCount: r.fert_count,
    });
  }
  return out;
}

// ------------------------------------------------------------
// Planting
// ------------------------------------------------------------

const plantTx = db.transaction((gid, uid, cropId, amount, now) => {
  const crop = cropMap.get(cropId);
  if (!crop) throw new FarmError('That crop does not exist.');

  openFarmTx(gid, uid, now);
  const p = S.getPlayer.get(gid, uid);

  if (p.level < crop.level) {
    throw new FarmError(`${crop.name} unlocks at farming level ${crop.level}. You are level ${p.level}.`);
  }

  const occupied = new Set(S.plotNos.all(gid, uid).map(r => r.plot_no));
  const empty = [];
  for (let n = 1; n <= p.plots; n++) if (!occupied.has(n)) empty.push(n);

  if (empty.length === 0) throw new FarmError('All of your plots are in use. Harvest something first.');

  const seeds = getQty(gid, uid, `seed:${crop.id}`);
  if (seeds <= 0) throw new FarmError(`You have no ${crop.name} seeds. Buy some from the shop.`);

  let n = amount === 'max' ? Math.min(empty.length, seeds) : Math.floor(Number(amount));
  if (!Number.isSafeInteger(n) || n < 1) throw new FarmError('Enter a valid amount to plant.');
  if (n > empty.length) throw new FarmError(`You only have ${empty.length} empty plot${empty.length === 1 ? '' : 's'}.`);
  if (n > seeds) throw new FarmError(`You only have ${seeds} ${crop.name} seed${seeds === 1 ? '' : 's'}.`);

  takeItem(gid, uid, `seed:${crop.id}`, n, `${crop.name} seeds`);

  const market = getMarket(gid, now);
  const can = canByTier.get(p.can_tier) || canByTier.get(1);
  let growMs = crop.growMs * (1 - can.bonus);
  if (market.event?.id === 'rain') growMs *= market.event.growMult;
  growMs = Math.max(CFG.MIN_GROW_MS, Math.round(growMs));

  const planted = empty.slice(0, n);
  for (const no of planted) {
    S.insPlot.run(gid, uid, no, crop.id, now, now + growMs);
  }

  const notes = {};
  bumpQuests(gid, uid, 'plant_any', null, n, now, notes);
  log(gid, uid, 'plant', `${n} ${crop.id}`, 0, now);

  return {
    crop,
    planted,
    growMs,
    seedsLeft: seeds - n,
    rain: market.event?.id === 'rain',
    notes,
  };
});

function plant(gid, uid, cropId, amount = 1) {
  return plantTx(String(gid), String(uid), cropId, amount, Date.now());
}

// ------------------------------------------------------------
// Harvesting
// ------------------------------------------------------------

const harvestTx = db.transaction((gid, uid, plotNo, now) => {
  openFarmTx(gid, uid, now);
  const p = S.getPlayer.get(gid, uid);
  const market = getMarket(gid, now);
  const hoe = hoeByTier.get(p.hoe_tier);

  let rows = S.plots.all(gid, uid);

  if (plotNo != null) {
    const row = rows.find(r => r.plot_no === plotNo);
    if (plotNo < 1 || plotNo > p.plots) throw new FarmError(`You do not have a plot ${plotNo}.`);
    if (!row) throw new FarmError(`Plot ${plotNo} is empty.`);
    if (row.ready_at > now) {
      const crop = cropMap.get(row.crop_id);
      throw new FarmError(`${crop?.name || 'That crop'} on plot ${plotNo} is not ready yet.`);
    }
    rows = [row];
  } else {
    rows = rows.filter(r => r.ready_at <= now);
  }

  if (rows.length === 0) throw new FarmError('Nothing is ready to harvest yet.');

  const xpMult = market.event?.id === 'festival' ? market.event.xpMult : 1;
  const byCrop = new Map();
  const drops = {};
  let xpTotal = 0;
  let units = 0;

  for (const r of rows) {
    const crop = cropMap.get(r.crop_id);
    if (!crop) {
      // Unknown crop id (config changed): free the plot rather than get stuck.
      S.delPlot.run(gid, uid, r.plot_no);
      continue;
    }

    let amount = randInt(crop.yield[0], crop.yield[1]);
    let bonus = 0;

    if (hoe && chance(hoe.chance)) bonus += Math.max(1, Math.round(amount * 0.25));
    if (crop.berry && market.event?.id === 'pollination') {
      bonus += Math.max(1, Math.round(amount * market.event.berryBonus));
    }

    amount += bonus;

    addItem(gid, uid, `crop:${crop.id}`, amount);
    S.delPlot.run(gid, uid, r.plot_no);

    const entry = byCrop.get(crop.id) || { crop, plots: 0, units: 0, bonus: 0 };
    entry.plots += 1;
    entry.units += amount;
    entry.bonus += bonus;
    byCrop.set(crop.id, entry);

    units += amount;
    xpTotal += Math.round(crop.xp * xpMult);

    for (const d of CFG.HARVEST_DROPS) {
      if (p.level >= d.minLevel && chance(d.chance)) {
        addItem(gid, uid, `fert:${d.item}`, 1);
        drops[d.item] = (drops[d.item] || 0) + 1;
      }
    }
  }

  const harvested = [...byCrop.values()];
  const plotCount = harvested.reduce((s, e) => s + e.plots, 0);
  if (plotCount === 0) throw new FarmError('Nothing is ready to harvest yet.');

  S.addHarvest.run(units, plotCount, gid, uid);

  const notes = {};
  addXp(gid, uid, xpTotal, notes);

  for (const e of harvested) {
    bumpQuests(gid, uid, 'harvest_crop', e.crop.id, e.units, now, notes);
  }
  bumpQuests(gid, uid, 'harvest_plots', null, plotCount, now, notes);

  checkAchievements(gid, uid, now, notes);
  log(gid, uid, 'harvest', harvested.map(e => `${e.units} ${e.crop.id}`).join(', '), 0, now);

  return {
    harvested,
    plotCount,
    units,
    xp: xpTotal,
    xpMult,
    drops,
    festival: xpMult > 1,
    pollination: market.event?.id === 'pollination',
    notes,
  };
});

function harvest(gid, uid, plotNo = null) {
  return harvestTx(String(gid), String(uid), plotNo, Date.now());
}

// ------------------------------------------------------------
// Fertilizer
// ------------------------------------------------------------

const fertilizeTx = db.transaction((gid, uid, plotNo, fertId, now) => {
  openFarmTx(gid, uid, now);

  const row = S.getPlot.get(gid, uid, plotNo);
  if (!row) throw new FarmError(`Plot ${plotNo} has nothing planted.`);
  if (row.ready_at <= now) throw new FarmError(`Plot ${plotNo} is already ready to harvest.`);
  if (row.fert_count >= CFG.MAX_FERT_PER_PLOT) {
    throw new FarmError(`Plot ${plotNo} already has the maximum of ${CFG.MAX_FERT_PER_PLOT} fertilizer applications.`);
  }

  let fert = fertId ? fertMap.get(fertId) : null;
  if (fertId && !fert) throw new FarmError('Unknown fertilizer. Use basic, advanced or premium.');

  if (!fert) {
    // Use the weakest fertilizer the player owns.
    fert = CFG.FERTILIZERS.find(f => getQty(gid, uid, `fert:${f.id}`) > 0);
    if (!fert) throw new FarmError('You have no fertilizer. Buy some from the shop.');
  }

  takeItem(gid, uid, `fert:${fert.id}`, 1, fert.name);

  const remaining = row.ready_at - now;
  const newReady = now + Math.max(0, Math.floor(remaining * (1 - fert.cut)));
  S.fertPlot.run(newReady, gid, uid, plotNo);
  log(gid, uid, 'fertilize', `plot ${plotNo} ${fert.id}`, 0, now);

  const crop = cropMap.get(row.crop_id);
  return {
    plotNo,
    fert,
    crop,
    savedMs: remaining - (newReady - now),
    remainingMs: newReady - now,
    applications: row.fert_count + 1,
  };
});

function fertilize(gid, uid, plotNo, fertId = null) {
  plotNo = Math.floor(Number(plotNo));
  if (!Number.isInteger(plotNo) || plotNo < 1) throw new FarmError('Use a plot number, for example `fertilize 2`.');
  return fertilizeTx(String(gid), String(uid), plotNo, fertId, Date.now());
}

// ------------------------------------------------------------
// Selling
// ------------------------------------------------------------

const sellTx = db.transaction((gid, uid, cropId, amount, now) => {
  const crop = cropMap.get(cropId);
  if (!crop) throw new FarmError('That crop does not exist.');

  openFarmTx(gid, uid, now);

  const have = getQty(gid, uid, `crop:${crop.id}`);
  if (have <= 0) throw new FarmError(`You have no ${crop.name} to sell.`);

  const n = amount === 'all' ? have : Math.floor(Number(amount));
  if (!Number.isSafeInteger(n) || n < 1) throw new FarmError('Enter a valid amount to sell.');
  if (n > have) throw new FarmError(`You only have ${have} ${crop.name}.`);

  const market = getMarket(gid, now);
  const unit = unitPrice(crop, market);
  const total = unit * n;
  if (!Number.isSafeInteger(total)) throw new FarmError('That amount is too large.');

  takeItem(gid, uid, `crop:${crop.id}`, n, crop.name);
  pay(gid, uid, total, 'farm_sell', `Sold ${n} ${crop.name}`, now);

  const notes = {};
  bumpQuests(gid, uid, 'sell_any', null, n, now, notes);
  checkAchievements(gid, uid, now, notes);
  log(gid, uid, 'sell', `${n} ${crop.id} @ ${unit}`, total, now);

  return { crop, amount: n, unit, total, balance: economy.getBalance(gid, uid), notes };
});

function sell(gid, uid, cropId, amount = 'all') {
  return sellTx(String(gid), String(uid), cropId, amount, Date.now());
}

function sellAllPreview(gid, uid, now = Date.now()) {
  gid = String(gid);
  uid = String(uid);
  const market = getMarket(gid, now);
  const lines = [];
  let total = 0;

  for (const row of S.allItems.all(gid, uid)) {
    if (!row.item_id.startsWith('crop:')) continue;
    const crop = cropMap.get(row.item_id.slice(5));
    if (!crop) continue;
    const unit = unitPrice(crop, market);
    lines.push({ crop, qty: row.qty, unit, total: unit * row.qty });
    total += unit * row.qty;
  }
  return { lines, total };
}

const sellAllTx = db.transaction((gid, uid, now) => {
  openFarmTx(gid, uid, now);
  const market = getMarket(gid, now);
  const lines = [];
  let total = 0;
  let units = 0;

  for (const row of S.allItems.all(gid, uid)) {
    if (!row.item_id.startsWith('crop:')) continue;
    const crop = cropMap.get(row.item_id.slice(5));
    if (!crop) continue;

    const unit = unitPrice(crop, market);
    takeItem(gid, uid, row.item_id, row.qty, crop.name);
    lines.push({ crop, qty: row.qty, unit, total: unit * row.qty });
    total += unit * row.qty;
    units += row.qty;
  }

  if (units === 0) throw new FarmError('You have no produce to sell.');
  if (!Number.isSafeInteger(total)) throw new FarmError('That amount is too large.');

  pay(gid, uid, total, 'farm_sell', `Sold ${units} produce`, now);

  const notes = {};
  bumpQuests(gid, uid, 'sell_any', null, units, now, notes);
  checkAchievements(gid, uid, now, notes);
  log(gid, uid, 'sell_all', `${units} units`, total, now);

  return { lines, total, units, balance: economy.getBalance(gid, uid), notes };
});

function sellAll(gid, uid) {
  return sellAllTx(String(gid), String(uid), Date.now());
}

// ------------------------------------------------------------
// Shop
// ------------------------------------------------------------

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function cropCandidates(query) {
  let k = norm(query);
  k = k.replace(/seeds?$/, '');
  return [k, k.replace(/ies$/, 'y'), k.replace(/es$/, ''), k.replace(/s$/, '')];
}

function resolveCrop(query) {
  const candidates = cropCandidates(query);
  for (const c of CFG.CROPS) {
    const keys = [norm(c.id), norm(c.name)];
    if (candidates.some(k => k && keys.includes(k))) return c;
  }
  return null;
}

// Anything that can be bought: seeds, tools, fertilizer, decorations.
function resolveShopItem(query) {
  const k = norm(query);
  if (!k) return null;

  for (const t of CFG.WATERING_CANS) {
    if ([norm(t.id), norm(t.name)].includes(k)) return { kind: 'can', ...t };
  }
  for (const t of CFG.HOES) {
    if ([norm(t.id), norm(t.name)].includes(k)) return { kind: 'hoe', ...t };
  }
  for (const f of CFG.FERTILIZERS) {
    if ([norm(f.id), norm(f.name), `${norm(f.id)}fertilizer`].includes(k)) return { kind: 'fert', ...f };
  }
  if (['fertilizer', 'fert'].includes(k)) return { kind: 'fert', ...CFG.FERTILIZERS[0] };
  for (const d of CFG.DECORATIONS) {
    if ([norm(d.id), norm(d.name), norm(d.id.replace('decor_', ''))].includes(k)) return { kind: 'decor', ...d };
  }

  const crop = resolveCrop(query);
  if (crop) return { kind: 'seed', crop, id: crop.id, name: `${crop.name} Seeds`, cost: crop.seedCost, level: crop.level };

  return null;
}

const buyTx = db.transaction((gid, uid, item, amount, now) => {
  openFarmTx(gid, uid, now);
  const p = S.getPlayer.get(gid, uid);

  if (p.level < item.level) {
    throw new FarmError(`${item.name} unlocks at farming level ${item.level}. You are level ${p.level}.`);
  }

  let qty = Math.floor(Number(amount));
  if (item.kind === 'can' || item.kind === 'hoe' || item.kind === 'decor') qty = 1;
  if (!Number.isSafeInteger(qty) || qty < 1) throw new FarmError('Enter a valid amount to buy.');
  if (qty > CFG.MAX_BUY_PER_ORDER) throw new FarmError(`You can buy at most ${CFG.MAX_BUY_PER_ORDER} at a time.`);

  const total = item.cost * qty;
  if (!Number.isSafeInteger(total)) throw new FarmError('That amount is too large.');

  if (item.kind === 'can') {
    if (p.can_tier >= item.tier) throw new FarmError('You already own this watering can or a better one.');
  } else if (item.kind === 'hoe') {
    if (p.hoe_tier >= item.tier) throw new FarmError('You already own this hoe or a better one.');
  } else if (item.kind === 'decor') {
    const owned = S.getDecor.all(gid, uid).some(r => r.decor_id === item.id);
    if (owned) throw new FarmError('You already own that decoration.');
  }

  if (total > 0) charge(gid, uid, total, 'farm_buy', `Farm shop: ${qty}x ${item.name}`, now);

  if (item.kind === 'seed') addItem(gid, uid, `seed:${item.id}`, qty);
  else if (item.kind === 'fert') addItem(gid, uid, `fert:${item.id}`, qty);
  else if (item.kind === 'can') S.setCan.run(item.tier, gid, uid);
  else if (item.kind === 'hoe') S.setHoe.run(item.tier, gid, uid);
  else if (item.kind === 'decor') S.insDecor.run(gid, uid, item.id, now);

  log(gid, uid, 'buy', `${qty}x ${item.kind}:${item.id}`, total, now);
  return { item, qty, total, balance: economy.getBalance(gid, uid) };
});

function buy(gid, uid, item, amount = 1) {
  return buyTx(String(gid), String(uid), item, amount, Date.now());
}

// ------------------------------------------------------------
// Expansions
// ------------------------------------------------------------

function nextExpansion(player) {
  const idx = player.expansion_tier + 1;
  return CFG.EXPANSIONS[idx] ? { ...CFG.EXPANSIONS[idx], index: idx } : null;
}

const upgradeTx = db.transaction((gid, uid, now) => {
  openFarmTx(gid, uid, now);
  const p = S.getPlayer.get(gid, uid);
  const next = nextExpansion(p);
  if (!next) throw new FarmError('Your farm is already the biggest it can be.');

  charge(gid, uid, next.cost, 'farm_upgrade', `Farm expansion: ${next.name}`, now);
  // Existing crops are never touched - only the plot limit changes.
  S.setExpansion.run(next.plots, next.index, gid, uid);

  const notes = {};
  checkAchievements(gid, uid, now, notes);
  log(gid, uid, 'upgrade', next.name, next.cost, now);

  return { expansion: next, balance: economy.getBalance(gid, uid), notes };
});

function upgrade(gid, uid) {
  return upgradeTx(String(gid), String(uid), Date.now());
}

// ------------------------------------------------------------
// Inventory, dashboard, stats, leaderboard
// ------------------------------------------------------------

function inventorySections(gid, uid, now = Date.now()) {
  gid = String(gid);
  uid = String(uid);
  const market = getMarket(gid, now);

  const seeds = [];
  const produce = [];
  const supplies = [];
  let produceValue = 0;

  for (const row of S.allItems.all(gid, uid)) {
    const [type, id] = row.item_id.split(':');

    if (type === 'seed') {
      const c = cropMap.get(id);
      if (c) seeds.push(`${seedEmoji(c.id)}**${c.name}** seeds x${row.qty.toLocaleString('en-US')}`);
    } else if (type === 'crop') {
      const c = cropMap.get(id);
      if (c) {
        const unit = unitPrice(c, market);
        produceValue += unit * row.qty;
        produce.push(`${emoji(c.id)}**${c.name}** x${row.qty.toLocaleString('en-US')} (${money(unit)} each)`);
      }
    } else if (type === 'fert') {
      const f = fertMap.get(id);
      if (f) supplies.push(`${emoji(`fert_${f.id}`)}**${f.name}** x${row.qty.toLocaleString('en-US')}`);
    }
  }

  return { seeds, produce, supplies, produceValue };
}

function farmValue(gid, uid, now = Date.now()) {
  const p = S.getPlayer.get(gid, uid);
  if (!p) return 0;
  let value = 0;

  for (let i = 0; i <= p.expansion_tier; i++) value += CFG.EXPANSIONS[i]?.cost || 0;
  value += canByTier.get(p.can_tier)?.cost || 0;
  value += hoeByTier.get(p.hoe_tier)?.cost || 0;
  for (const d of S.getDecor.all(gid, uid)) value += decorMap.get(d.decor_id)?.cost || 0;

  for (const row of S.allItems.all(gid, uid)) {
    const [type, id] = row.item_id.split(':');
    if (type === 'seed') value += (cropMap.get(id)?.seedCost || 0) * row.qty;
    if (type === 'crop') value += (cropMap.get(id)?.price || 0) * row.qty;
    if (type === 'fert') value += (fertMap.get(id)?.cost || 0) * row.qty;
  }
  for (const r of S.plots.all(gid, uid)) value += cropMap.get(r.crop_id)?.seedCost || 0;

  return value;
}

function getDashboard(gid, uid, now = Date.now()) {
  gid = String(gid);
  uid = String(uid);
  const p = S.getPlayer.get(gid, uid);
  const plots = getPlots(gid, uid, now);
  const market = getMarket(gid, now);
  const decor = S.getDecor.all(gid, uid).map(r => decorMap.get(r.decor_id)).filter(Boolean);

  return {
    player: p,
    title: titleFor(p.level),
    xpNeeded: p.level >= CFG.MAX_LEVEL ? 0 : CFG.xpToNext(p.level),
    plots,
    ready: plots.filter(x => !x.empty && x.ready).length,
    used: plots.filter(x => !x.empty).length,
    wallet: economy.getBalance(gid, uid),
    value: farmValue(gid, uid, now),
    event: market.event,
    decor,
    can: canByTier.get(p.can_tier),
    hoe: hoeByTier.get(p.hoe_tier) || null,
  };
}

function getQuestBoard(gid, uid, now = Date.now()) {
  gid = String(gid);
  uid = String(uid);
  return db.transaction(() => {
    openFarmTx(gid, uid, now);
    const quests = ensureQuests(gid, uid, now);
    const contracts = ensureContracts(gid, uid, now);
    const bonus = !!S.getQuestBonus.get(gid, uid, dayKey(now));
    const p = S.getPlayer.get(gid, uid);
    return {
      quests,
      contracts,
      bonusClaimed: bonus,
      bonusCoins: CFG.QUEST_BONUS_COINS + p.level * 25,
      bonusXp: CFG.QUEST_BONUS_XP,
      contractsResetAt: (Number(periodKey(now)) + 1) * CFG.CONTRACT_PERIOD_MS - TZ_OFFSET_MS,
    };
  })();
}

function getStats(gid, uid) {
  gid = String(gid);
  uid = String(uid);
  const p = S.getPlayer.get(gid, uid);
  const earned = new Set(S.getAch.all(gid, uid).map(r => r.achievement_id));
  const achievements = CFG.ACHIEVEMENTS.map(a => ({ ...a, earned: earned.has(a.id) }));
  const titles = [titleFor(p.level), ...achievements.filter(a => a.earned && a.title).map(a => a.title)];
  return { player: p, title: titleFor(p.level), achievements, titles: [...new Set(titles)], value: farmValue(gid, uid) };
}

function leaderboard(gid, type = 'level', limit = 10) {
  gid = String(gid);
  const orders = {
    level: 'level DESC, xp DESC',
    earnings: 'total_earned DESC',
    harvested: 'crops_harvested DESC',
    contracts: 'contracts_done DESC',
  };

  if (type === 'value') {
    const ids = db.prepare(`SELECT user_id FROM farm_players WHERE guild_id = ?`).all(gid);
    return ids
      .map(r => ({ userId: r.user_id, value: farmValue(gid, r.user_id) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  const order = orders[type] || orders.level;
  const rows = db.prepare(`SELECT * FROM farm_players WHERE guild_id = ? ORDER BY ${order} LIMIT ?`).all(gid, limit);

  return rows.map(r => ({
    userId: r.user_id,
    value:
      type === 'earnings' ? r.total_earned :
      type === 'harvested' ? r.crops_harvested :
      type === 'contracts' ? r.contracts_done :
      r.level,
    xp: r.xp,
  }));
}

module.exports = {
  FarmError,
  CFG,
  money,
  titleFor,
  openFarm,
  hasFarm,
  getDashboard,
  getPlots,
  getMarket,
  unitPrice,
  inventorySections,
  getQuestBoard,
  questText,
  contractClient,
  getStats,
  leaderboard,
  resolveCrop,
  resolveShopItem,
  nextExpansion,
  cropMap,
  plant,
  harvest,
  fertilize,
  sell,
  sellAll,
  sellAllPreview,
  buy,
  upgrade,
  deliver,
  // exposed for tests
  _S: S,
  _db: db,
};
