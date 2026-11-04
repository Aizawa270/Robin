'use strict';

// ============================================================
// CLAN SERVICE
// Clan data lives in economy.sqlite so wallet debits, vault
// deposits, XP and clan changes share the economy database.
// ============================================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const { randomInt } = require('crypto');
const Database = require('better-sqlite3');

const economy = require('./economy');
const shopSystem = require('./shopSystem'); // initializes shop tables
const CFG = require('./clanConfig');
const db = economy.db;

if (!db || typeof db.prepare !== 'function') {
  throw new Error('[Clan] economy.db is unavailable. Check handlers/economy.js.');
}

class ClanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClanError';
  }
}

const RANK = { MEMBER: 1, SENIOR: 2, MANAGER: 3, COOWNER: 4, OWNER: 5 };
const RANK_NAMES = { 1: 'Member', 2: 'Senior', 3: 'Manager', 4: 'Co-owner', 5: 'Owner' };

// ------------------------------------------------------------
// Schema. CREATE IF NOT EXISTS and guarded ALTERs preserve data.
// ------------------------------------------------------------

db.exec(`
CREATE TABLE IF NOT EXISTS clans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  vault INTEGER NOT NULL DEFAULT 0 CHECK (vault >= 0),
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  xp_tier INTEGER NOT NULL DEFAULT 0,
  capacity_tier INTEGER NOT NULL DEFAULT 0,
  is_private INTEGER NOT NULL DEFAULT 0,
  logo_file TEXT,
  banner_file TEXT,
  created_at INTEGER NOT NULL DEFAULT 0,
  last_deposit_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE (guild_id, name_key)
);
CREATE TABLE IF NOT EXISTS clan_members (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  clan_id INTEGER NOT NULL,
  rank_no INTEGER NOT NULL DEFAULT 1,
  joined_at INTEGER NOT NULL DEFAULT 0,
  total_deposited INTEGER NOT NULL DEFAULT 0,
  last_deposit_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members (clan_id);
CREATE TABLE IF NOT EXISTS clan_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clan_deposits_clan ON clan_deposits (clan_id, ts);
CREATE TABLE IF NOT EXISTS clan_quests (
  clan_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  slot INTEGER NOT NULL,
  kind TEXT NOT NULL,
  tier TEXT NOT NULL,
  target INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clan_id, day_key, slot)
);
CREATE TABLE IF NOT EXISTS clan_quest_actors (
  clan_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (clan_id, day_key, kind, user_id)
);
CREATE TABLE IF NOT EXISTS clan_quest_bonus (
  clan_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (clan_id, day_key)
);
CREATE TABLE IF NOT EXISTS clan_user_history (
  clan_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  left_at INTEGER NOT NULL DEFAULT 0,
  inactive_kicks INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clan_id, user_id)
);
CREATE TABLE IF NOT EXISTS clan_daily_pool (
  guild_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  slot INTEGER NOT NULL,
  quest_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, day_key, slot)
);
CREATE TABLE IF NOT EXISTS clan_daily_stats (
  clan_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clan_id, day_key, user_id, metric)
);
CREATE TABLE IF NOT EXISTS clan_streaks (
  clan_id INTEGER NOT NULL,
  game TEXT NOT NULL,
  day_key TEXT NOT NULL,
  current INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clan_id, game)
);
CREATE TABLE IF NOT EXISTS clan_donors (
  clan_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  total_deposited INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clan_id, user_id)
);
`);

// Preserve donor totals for any clan data that was already created before
// the historical donor table was introduced.
db.prepare(`INSERT OR IGNORE INTO clan_donors (clan_id, user_id, total_deposited)
  SELECT clan_id, user_id, total_deposited FROM clan_members WHERE total_deposited > 0`).run();

function addColumn(table, columnSql) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`).run();
    return true;
  } catch {
    return false;
  }
}

addColumn('clans', 'logo_emoji TEXT');
const boosterColumnAdded = addColumn('clans', 'booster_tier INTEGER NOT NULL DEFAULT 0');
addColumn('clans', 'booster_until INTEGER NOT NULL DEFAULT 0');
if (boosterColumnAdded) {
  db.prepare('UPDATE clans SET booster_tier = xp_tier, booster_until = ? WHERE xp_tier > 0')
    .run(Date.now() + CFG.XP_BOOSTER_DURATION_MS);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'clan_media');
const shopDb = new Database(path.join(DATA_DIR, 'shop.sqlite'));
shopDb.pragma('journal_mode = WAL');
shopDb.pragma('busy_timeout = 5000');
const INV_TABLE = CFG.SHOP_KEY === 'ec' ? 'ec_shop_inventory' : 'normal_shop_inventory';
const SHOP = {
  take: shopDb.prepare(`UPDATE ${INV_TABLE} SET quantity = quantity - 1, last_updated = ? WHERE guild_id = ? AND user_id = ? AND item_id = ? AND quantity >= 1`),
  give: shopDb.prepare(`INSERT INTO ${INV_TABLE} (guild_id, user_id, item_id, quantity, last_updated) VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET quantity = quantity + 1, last_updated = excluded.last_updated`),
};

const DAY_MS = 24 * 60 * 60 * 1000;
const money = amount => economy.formatCurrency(amount);
const num = value => Number(value || 0).toLocaleString('en-US');
const nameKey = value => String(value).trim().toLowerCase().replace(/\s+/g, ' ');

function dayKey(timestamp = Date.now()) {
  const d = new Date(timestamp + CFG.TZ_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const pick = array => array[randomInt(0, array.length)];

function cleanName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (name.length < CFG.NAME_MIN || name.length > CFG.NAME_MAX) {
    throw new ClanError(`Clan names must be ${CFG.NAME_MIN} to ${CFG.NAME_MAX} characters long.`);
  }
  if (!/^[\p{L}\p{N} _'.\-]+$/u.test(name)) {
    throw new ClanError("Clan names can only use letters, numbers, spaces and these symbols: _ - . '");
  }
  return name;
}

// ------------------------------------------------------------
// Prepared statements
// ------------------------------------------------------------

const S = {
  getClan: db.prepare('SELECT * FROM clans WHERE id = ?'),
  clanByName: db.prepare('SELECT * FROM clans WHERE guild_id = ? AND name_key = ?'),
  allClans: db.prepare('SELECT * FROM clans'),
  insClan: db.prepare('INSERT INTO clans (guild_id, name, name_key, owner_id, created_at) VALUES (?, ?, ?, ?, ?)'),
  setName: db.prepare('UPDATE clans SET name = ?, name_key = ? WHERE id = ?'),
  setPrivate: db.prepare('UPDATE clans SET is_private = ? WHERE id = ?'),
  setLogo: db.prepare('UPDATE clans SET logo_file = ?, logo_emoji = NULL WHERE id = ?'),
  setLogoEmoji: db.prepare('UPDATE clans SET logo_emoji = ?, logo_file = NULL WHERE id = ?'),
  setBanner: db.prepare('UPDATE clans SET banner_file = ? WHERE id = ?'),
  setClanXp: db.prepare('UPDATE clans SET level = ?, xp = ? WHERE id = ?'),
  addVault: db.prepare('UPDATE clans SET vault = vault + ?, last_deposit_at = ? WHERE id = ?'),
  addVaultQuiet: db.prepare('UPDATE clans SET vault = vault + ? WHERE id = ?'),
  spendVault: db.prepare('UPDATE clans SET vault = vault - ? WHERE id = ? AND vault >= ?'),
  setBooster: db.prepare('UPDATE clans SET booster_tier = ?, booster_until = ? WHERE id = ?'),
  bumpCapTier: db.prepare('UPDATE clans SET capacity_tier = capacity_tier + 1 WHERE id = ?'),
  delClan: db.prepare('DELETE FROM clans WHERE id = ?'),
  leaderboard: db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS member_count
    FROM clans c WHERE c.guild_id = ? ORDER BY c.vault DESC, c.level DESC, c.id ASC LIMIT ? OFFSET ?`),
  countClans: db.prepare('SELECT COUNT(*) AS n FROM clans WHERE guild_id = ?'),

  getMember: db.prepare('SELECT * FROM clan_members WHERE guild_id = ? AND user_id = ?'),
  membersOf: db.prepare('SELECT * FROM clan_members WHERE clan_id = ? ORDER BY rank_no DESC, joined_at ASC, user_id ASC'),
  countMembers: db.prepare('SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ?'),
  countRank: db.prepare('SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ? AND rank_no = ?'),
  insMember: db.prepare('INSERT INTO clan_members (guild_id, user_id, clan_id, rank_no, joined_at) VALUES (?, ?, ?, ?, ?)'),
  delMember: db.prepare('DELETE FROM clan_members WHERE guild_id = ? AND user_id = ?'),
  delMembersOf: db.prepare('DELETE FROM clan_members WHERE clan_id = ?'),
  setRank: db.prepare('UPDATE clan_members SET rank_no = ? WHERE guild_id = ? AND user_id = ?'),
  memberDeposit: db.prepare('UPDATE clan_members SET total_deposited = total_deposited + ?, last_deposit_at = ? WHERE guild_id = ? AND user_id = ?'),
  topDonors: db.prepare('SELECT user_id, total_deposited FROM clan_donors WHERE clan_id = ? AND total_deposited > 0 ORDER BY total_deposited DESC, user_id ASC LIMIT 3'),
  addDonor: db.prepare(`INSERT INTO clan_donors (clan_id, user_id, total_deposited) VALUES (?, ?, ?)
    ON CONFLICT(clan_id, user_id) DO UPDATE SET total_deposited = total_deposited + excluded.total_deposited`),

  insDeposit: db.prepare('INSERT INTO clan_deposits (clan_id, guild_id, user_id, amount, ts) VALUES (?, ?, ?, ?, ?)'),
  recentDeposits: db.prepare('SELECT * FROM clan_deposits WHERE clan_id = ? AND ts >= ? ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?'),
  countDeposits: db.prepare('SELECT COUNT(*) AS n FROM clan_deposits WHERE clan_id = ? AND ts >= ?'),
  pruneDeposits: db.prepare('DELETE FROM clan_deposits WHERE ts < ?'),
  delDeposits: db.prepare('DELETE FROM clan_deposits WHERE clan_id = ?'),

  getQuests: db.prepare('SELECT * FROM clan_quests WHERE clan_id = ? AND day_key = ? ORDER BY slot'),
  insQuest: db.prepare('INSERT OR IGNORE INTO clan_quests (clan_id, day_key, slot, kind, tier, target, reward_coins, reward_xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  delQuest: db.prepare('DELETE FROM clan_quests WHERE clan_id = ? AND day_key = ? AND slot = ?'),
  setQuestProgress: db.prepare('UPDATE clan_quests SET progress = ? WHERE clan_id = ? AND day_key = ? AND slot = ? AND done = 0'),
  finishQuest: db.prepare('UPDATE clan_quests SET progress = target, done = 1 WHERE clan_id = ? AND day_key = ? AND slot = ? AND done = 0'),
  delQuests: db.prepare('DELETE FROM clan_quests WHERE clan_id = ?'),
  delActors: db.prepare('DELETE FROM clan_quest_actors WHERE clan_id = ?'),
  insBonus: db.prepare('INSERT OR IGNORE INTO clan_quest_bonus (clan_id, day_key, claimed_at) VALUES (?, ?, ?)'),
  getBonus: db.prepare('SELECT 1 FROM clan_quest_bonus WHERE clan_id = ? AND day_key = ?'),
  delBonus: db.prepare('DELETE FROM clan_quest_bonus WHERE clan_id = ?'),

  getPool: db.prepare('SELECT quest_id FROM clan_daily_pool WHERE guild_id = ? AND day_key = ? ORDER BY slot'),
  insPool: db.prepare('INSERT OR IGNORE INTO clan_daily_pool (guild_id, day_key, slot, quest_id) VALUES (?, ?, ?, ?)'),
  prunePool: db.prepare('DELETE FROM clan_daily_pool WHERE day_key < ?'),
  addStat: db.prepare(`INSERT INTO clan_daily_stats (clan_id, day_key, user_id, metric, value) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(clan_id, day_key, user_id, metric) DO UPDATE SET value = value + excluded.value`),
  sumStat: db.prepare('SELECT COALESCE(SUM(value), 0) AS n FROM clan_daily_stats WHERE clan_id = ? AND day_key = ? AND metric = ?'),
  distinctStat: db.prepare('SELECT COUNT(*) AS n FROM clan_daily_stats WHERE clan_id = ? AND day_key = ? AND metric = ? AND value >= ?'),
  pruneStats: db.prepare('DELETE FROM clan_daily_stats WHERE day_key < ?'),
  delStats: db.prepare('DELETE FROM clan_daily_stats WHERE clan_id = ?'),

  getStreak: db.prepare('SELECT * FROM clan_streaks WHERE clan_id = ? AND game = ?'),
  setStreak: db.prepare(`INSERT INTO clan_streaks (clan_id, game, day_key, current, best) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(clan_id, game) DO UPDATE SET day_key = excluded.day_key, current = excluded.current, best = excluded.best`),
  delStreaks: db.prepare('DELETE FROM clan_streaks WHERE clan_id = ?'),

  getHistory: db.prepare('SELECT * FROM clan_user_history WHERE clan_id = ? AND user_id = ?'),
  ensureHistory: db.prepare('INSERT OR IGNORE INTO clan_user_history (clan_id, guild_id, user_id) VALUES (?, ?, ?)'),
  setLeft: db.prepare('UPDATE clan_user_history SET left_at = ? WHERE clan_id = ? AND user_id = ?'),
  addInactiveKick: db.prepare('UPDATE clan_user_history SET inactive_kicks = inactive_kicks + 1 WHERE clan_id = ? AND user_id = ?'),
  setBanned: db.prepare('UPDATE clan_user_history SET banned = 1 WHERE clan_id = ? AND user_id = ?'),
  delHistory: db.prepare('DELETE FROM clan_user_history WHERE clan_id = ?'),
  delDonors: db.prepare('DELETE FROM clan_donors WHERE clan_id = ?'),
};

// ------------------------------------------------------------
// Clan lookups
// ------------------------------------------------------------

function clanCapacity(clan) {
  const tier = Number(clan.capacity_tier || 0);
  return tier > 0 ? CFG.CAPACITY[tier - 1]?.capacity || CFG.BASE_CAPACITY : CFG.BASE_CAPACITY;
}

function xpBoost(clan, now = Date.now()) {
  if (Number(clan.booster_until || 0) <= now) return 0;
  return CFG.XP_BOOSTER[Number(clan.booster_tier || 0) - 1]?.bonus || 0;
}

function getMembership(gid, uid) {
  gid = String(gid);
  uid = String(uid);
  const member = S.getMember.get(gid, uid);
  if (!member) return null;
  const clan = S.getClan.get(member.clan_id);
  if (!clan) {
    S.delMember.run(gid, uid);
    return null;
  }
  return { clan, member };
}

function requireMembership(gid, uid) {
  const found = getMembership(gid, uid);
  if (!found) throw new ClanError('You are not in a clan.');
  return found;
}

function getClanByName(gid, name) {
  return S.clanByName.get(String(gid), nameKey(name)) || null;
}

function assertNameFree(gid, name, exceptClanId = null) {
  const existing = S.clanByName.get(String(gid), nameKey(name));
  if (existing && existing.id !== exceptClanId) throw new ClanError('A clan with that name already exists.');
}

function describeClan(clan, now = Date.now()) {
  const members = S.membersOf.all(clan.id);
  const ids = rank => members.filter(m => m.rank_no === rank).map(m => m.user_id);
  const need = clan.level >= CFG.MAX_LEVEL ? 0 : CFG.xpToNext(clan.level);
  return {
    clan,
    capacity: clanCapacity(clan),
    boost: xpBoost(clan, now),
    memberCount: members.length,
    owner: clan.owner_id,
    coOwners: ids(RANK.COOWNER),
    managers: ids(RANK.MANAGER),
    seniors: ids(RANK.SENIOR),
    donors: S.topDonors.all(clan.id),
    xpNeeded: need,
    pct: need ? Math.min(100, Math.floor((clan.xp / need) * 100)) : 100,
  };
}

function getLeaderboard(gid, page = 0, size = 10) {
  gid = String(gid);
  const total = S.countClans.get(gid).n;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { rows: S.leaderboard.all(gid, size, current * size), total, pages, page: current, offset: current * size };
}

// ------------------------------------------------------------
// XP and levels
// ------------------------------------------------------------

function addClanXp(clanId, amount, notes) {
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  if (amount <= 0) return;
  const current = S.getClan.get(clanId);
  if (!current) return;
  let level = current.level;
  let xp = current.xp + amount;
  const gained = [];
  while (level < CFG.MAX_LEVEL && xp >= CFG.xpToNext(level)) {
    xp -= CFG.xpToNext(level);
    level += 1;
    gained.push(level);
  }
  if (level >= CFG.MAX_LEVEL) xp = 0;
  S.setClanXp.run(level, xp, clanId);
  if (notes) {
    notes.xp = (notes.xp || 0) + amount;
    if (gained.length) notes.levelUps = [...(notes.levelUps || []), ...gained];
  }
}

// ------------------------------------------------------------
// Daily quests
// ------------------------------------------------------------

const POOL = new Map(CFG.QUEST_POOL.map(q => [q.id, q]));
function questText(quest) {
  const def = POOL.get(quest.kind);
  return def ? def.text(quest.target) : 'Quest';
}

function pickDailyQuests(avoid) {
  const all = CFG.QUEST_POOL;
  const fresh = list => {
    const unused = list.filter(q => !avoid.has(q.id));
    return pick(unused.length ? unused : list);
  };
  const games = [...new Set(all.filter(q => q.cat === 'gaming').map(q => q.game))];
  for (let attempt = 0; attempt < 30; attempt++) {
    const [g1, g2] = shuffle(games);
    const chosen = [
      fresh(all.filter(q => q.cat === 'economic')),
      fresh(all.filter(q => q.game === g1)),
      fresh(all.filter(q => q.game === g2)),
      fresh(all.filter(q => q.cat === 'recruitment')),
    ];
    if (new Set(chosen.map(q => q.tier)).size >= 2 || attempt === 29) {
      return shuffle(chosen).slice(0, CFG.QUEST_COUNT).map(q => q.id);
    }
  }
  return [];
}

function ensureDailyPool(guildId, now) {
  const dk = dayKey(now);
  let rows = S.getPool.all(guildId, dk);
  if (!rows.length) {
    const yesterday = new Set(S.getPool.all(guildId, dayKey(now - DAY_MS)).map(r => r.quest_id));
    pickDailyQuests(yesterday).forEach((id, slot) => S.insPool.run(guildId, dk, slot, id));
    rows = S.getPool.all(guildId, dk);
  }
  return rows.map(r => r.quest_id);
}

function ensureQuests(clanRow, now) {
  const dk = dayKey(now);
  let rows = S.getQuests.all(clanRow.id, dk);
  for (const row of rows) {
    if (!POOL.has(row.kind) && !row.done) S.delQuest.run(clanRow.id, dk, row.slot);
  }
  rows = S.getQuests.all(clanRow.id, dk);
  if (rows.length >= CFG.QUEST_COUNT) return rows;

  const ids = ensureDailyPool(clanRow.guild_id, now);
  const memberCount = S.countMembers.get(clanRow.id).n;
  const full = memberCount >= clanCapacity(clanRow);
  const have = new Set(rows.map(r => r.slot));

  ids.forEach((id, slot) => {
    if (have.has(slot)) return;
    let def = POOL.get(id);
    if (!def) return;
    if (def.cat === 'recruitment' && full) {
      const spare = CFG.QUEST_POOL.filter(q => q.cat === 'economic' && !ids.includes(q.id));
      if (spare.length) def = pick(spare);
    }
    let target = def.target;
    if (def.type === 'distinct') target = Math.max(1, Math.min(target, memberCount));
    const reward = CFG.QUEST_TIERS[def.tier];
    S.insQuest.run(clanRow.id, dk, slot, def.id, def.tier, target, reward.coins, reward.xp);
  });
  return S.getQuests.all(clanRow.id, dk);
}

function progressOf(clanId, dk, def) {
  if (def.type === 'sum') return S.sumStat.get(clanId, dk, def.metric).n;
  if (def.type === 'distinct') return S.distinctStat.get(clanId, dk, def.metric, def.min || 1).n;
  if (def.type === 'streak') {
    const row = S.getStreak.get(clanId, def.metric);
    return row && row.day_key === dk ? row.best : 0;
  }
  return 0;
}

function recordMetric(clanId, dk, userId, metric, delta = 1) {
  S.addStat.run(clanId, dk, String(userId), metric, Math.floor(delta));
}

function updateStreak(clanId, game, dk, result) {
  if (result === null || result === undefined) return;
  const row = S.getStreak.get(clanId, game);
  let current = row && row.day_key === dk ? row.current : 0;
  let best = row && row.day_key === dk ? row.best : 0;
  if (result) {
    current += 1;
    best = Math.max(best, current);
  } else {
    current = 0;
  }
  S.setStreak.run(clanId, game, dk, current, best);
}

function evaluateQuests(clanId, now, notes) {
  const clanRow = S.getClan.get(clanId);
  if (!clanRow) return;
  const dk = dayKey(now);
  const quests = ensureQuests(clanRow, now);
  const boost = xpBoost(clanRow, now);
  for (const quest of quests) {
    if (quest.done) continue;
    const def = POOL.get(quest.kind);
    if (!def) continue;
    const progress = Math.min(quest.target, progressOf(clanId, dk, def));
    if (progress < quest.target) {
      if (progress !== quest.progress) S.setQuestProgress.run(progress, clanId, dk, quest.slot);
      continue;
    }
    const res = S.finishQuest.run(clanId, dk, quest.slot);
    if (res.changes === 1) {
      const xp = Math.round(quest.reward_xp * (1 + boost));
      S.addVaultQuiet.run(quest.reward_coins, clanId);
      addClanXp(clanId, xp, notes);
      if (notes) {
        notes.quests = notes.quests || [];
        notes.quests.push({ text: questText(quest), coins: quest.reward_coins, xp });
      }
    }
  }

  const refreshed = S.getQuests.all(clanId, dk);
  if (refreshed.length && refreshed.every(q => q.done)) {
    const res = S.insBonus.run(clanId, dk, now);
    if (res.changes === 1) {
      const xp = Math.round(CFG.QUEST_BONUS_XP * (1 + boost));
      addClanXp(clanId, xp, notes);
      if (notes) notes.questBonus = { xp };
    }
  }
}

const questBoardTx = db.transaction((gid, uid, now) => {
  const { clan: clanRow } = requireMembership(gid, uid);
  const quests = ensureQuests(clanRow, now);
  const boost = xpBoost(clanRow, now);
  return {
    clan: clanRow,
    quests,
    bonusClaimed: !!S.getBonus.get(clanRow.id, dayKey(now)),
    boost,
    bonusXp: Math.round(CFG.QUEST_BONUS_XP * (1 + boost)),
  };
});
function getQuestBoard(gid, uid, now = Date.now()) {
  return questBoardTx(String(gid), String(uid), now);
}

// result: true = win, false = loss, null = draw/push.
function recordGame(guildId, userId, game, result, now = Date.now()) {
  try {
    const found = getMembership(guildId, userId);
    if (!found) return null;
    const allowedGames = new Set(['coinflip', 'spinwheel', 'dice', 'blackjack']);
    if (!allowedGames.has(String(game))) return null;
    const notes = {};
    db.transaction(() => {
      const dk = dayKey(now);
      const id = found.clan.id;
      ensureQuests(found.clan, now);
      recordMetric(id, dk, userId, `${game}_play`, 1);
      if (result === true) recordMetric(id, dk, userId, `${game}_win`, 1);
      updateStreak(id, game, dk, result);
      evaluateQuests(id, now, notes);
    })();
    return notes;
  } catch (error) {
    console.error('[Clan] recordGame failed:', error);
    return null;
  }
}

function recordFarm(guildId, userId, harvested, now = Date.now()) {
  try {
    const found = getMembership(guildId, userId);
    if (!found) return null;
    const notes = {};
    db.transaction(() => {
      const dk = dayKey(now);
      const id = found.clan.id;
      ensureQuests(found.clan, now);
      recordMetric(id, dk, userId, 'farm_play', 1);
      if (harvested) recordMetric(id, dk, userId, 'farm_harvest', 1);
      evaluateQuests(id, now, notes);
    })();
    return notes;
  } catch (error) {
    console.error('[Clan] recordFarm failed:', error);
    return null;
  }
}

async function announce(channel, notes) {
  if (!channel?.send || !notes) return;
  const quiet = { parse: [] };
  for (const quest of notes.quests || []) {
    await channel.send({ content: `Clan quest **${quest.text}** completed!`, allowedMentions: quiet }).catch(() => {});
  }
  if (notes.questBonus) {
    await channel.send({ content: `All daily clan quests completed! The clan earned a bonus of ${num(notes.questBonus.xp)} XP.`, allowedMentions: quiet }).catch(() => {});
  }
  for (const level of notes.levelUps || []) {
    await channel.send({ content: `The clan reached level **${level}**!`, allowedMentions: quiet }).catch(() => {});
  }
}

async function trackGame(message, game, result) {
  try {
    if (!message?.guild) return;
    const notes = recordGame(message.guild.id, message.author.id, game, result);
    if (notes) await announce(message.channel, notes);
  } catch (error) {
    console.error('[Clan] trackGame failed:', error);
  }
}

async function trackFarm(message, harvested) {
  try {
    if (!message?.guild) return;
    const notes = recordFarm(message.guild.id, message.author.id, !!harvested);
    if (notes) await announce(message.channel, notes);
  } catch (error) {
    console.error('[Clan] trackFarm failed:', error);
  }
}

// ------------------------------------------------------------
// Creating, naming and joining
// ------------------------------------------------------------

function findClanItem(guildId) {
  const items = shopSystem.listShopItems(CFG.SHOP_KEY, String(guildId));
  if (CFG.SHOP_ITEM_ID) {
    const pinned = String(CFG.SHOP_ITEM_ID).padStart(2, '0');
    return items.find(item => String(item.item_id) === pinned) || null;
  }
  const names = CFG.SHOP_ITEM_NAMES.map(value => value.toLowerCase());
  return items.find(item => names.includes(String(item.name).trim().toLowerCase())) || null;
}

const createTx = db.transaction((gid, uid, name, now) => {
  if (S.getMember.get(gid, uid)) throw new ClanError('You are already in a clan.');
  assertNameFree(gid, name);
  const result = S.insClan.run(gid, name, nameKey(name), uid, now);
  const id = Number(result.lastInsertRowid);
  S.insMember.run(gid, uid, id, RANK.OWNER, now);
  return S.getClan.get(id);
});

function createFromVoucher(gid, uid, rawName, now = Date.now()) {
  gid = String(gid);
  uid = String(uid);
  if (S.getMember.get(gid, uid)) throw new ClanError('You are already in a clan.');
  const name = cleanName(rawName);
  assertNameFree(gid, name);
  const item = findClanItem(gid);
  if (!item) throw new ClanError('The clan item has not been added to the shop yet. Ask an admin to add it.');

  const taken = SHOP.take.run(now, gid, uid, String(item.item_id));
  if (taken.changes === 0) {
    throw new ClanError(`You do not own a clan yet. Buy one from the shop for ${money(item.price)}, then run this command again.`);
  }
  try {
    return createTx(gid, uid, name, now);
  } catch (error) {
    SHOP.give.run(gid, uid, String(item.item_id), now);
    throw error;
  }
}

const renameTx = db.transaction((gid, uid, rawName, now) => {
  const { clan: clanRow, member } = requireMembership(gid, uid);
  if (member.rank_no !== RANK.OWNER) throw new ClanError('Only the clan owner can rename the clan.');
  const name = cleanName(rawName);
  assertNameFree(gid, name, clanRow.id);
  const removed = economy.removeCrowns(gid, uid, CFG.RENAME_COST, {
    type: 'clan_rename',
    reason: `Clan rename: ${clanRow.name} to ${name}`,
    actorId: uid,
    timestamp: now,
  });
  if (!removed) throw new ClanError(`Renaming costs ${money(CFG.RENAME_COST)}, but you only have ${money(economy.getBalance(gid, uid))}.`);
  S.setName.run(name, nameKey(name), clanRow.id);
  return { clan: S.getClan.get(clanRow.id), oldName: clanRow.name, cost: CFG.RENAME_COST };
});
function renameClan(gid, uid, rawName, now = Date.now()) {
  return renameTx(String(gid), String(uid), rawName, now);
}

const joinTx = db.transaction((gid, uid, clanId, now, viaInvite) => {
  if (S.getMember.get(gid, uid)) throw new ClanError('You are already in a clan.');
  const clanRow = S.getClan.get(clanId);
  if (!clanRow || clanRow.guild_id !== gid) throw new ClanError('That clan no longer exists.');
  const history = S.getHistory.get(clanId, uid);
  if (history?.banned) throw new ClanError(`You are banned from **${clanRow.name}**.`);
  if (history?.left_at && now - history.left_at < CFG.REJOIN_LOCK_MS) {
    const wait = CFG.REJOIN_LOCK_MS - (now - history.left_at);
    throw new ClanError(`You left **${clanRow.name}** recently. You can rejoin in **${economy.formatDuration(wait)}**.`);
  }
  if (S.countMembers.get(clanId).n >= clanCapacity(clanRow)) throw new ClanError(`**${clanRow.name}** is full.`);
  if (clanRow.is_private && !viaInvite) throw new ClanError(`**${clanRow.name}** is private. It can only be joined by invitation.`);

  S.insMember.run(gid, uid, clanId, RANK.MEMBER, now);
  const notes = {};
  const dk = dayKey(now);
  ensureQuests(clanRow, now);
  recordMetric(clanId, dk, uid, 'recruit', 1);
  if (viaInvite) recordMetric(clanId, dk, uid, 'recruit_invite', 1);
  evaluateQuests(clanId, now, notes);
  return { clan: S.getClan.get(clanId), notes };
});
function joinClan(gid, uid, clanId, now = Date.now(), viaInvite = false) {
  return joinTx(String(gid), String(uid), Number(clanId), now, !!viaInvite);
}
function joinByName(gid, uid, rawName, now = Date.now()) {
  const clanRow = getClanByName(gid, rawName);
  if (!clanRow) throw new ClanError(`I could not find a clan called "${String(rawName).trim()}".`);
  if (clanRow.is_private) throw new ClanError(`**${clanRow.name}** is private. It can only be joined by invitation.`);
  return joinTx(String(gid), String(uid), clanRow.id, now, false);
}

const leaveTx = db.transaction((gid, uid, now) => {
  const { clan: clanRow, member } = requireMembership(gid, uid);
  if (member.rank_no === RANK.OWNER) throw new ClanError('The owner cannot leave the clan.');
  S.delMember.run(gid, uid);
  S.ensureHistory.run(clanRow.id, gid, uid);
  S.setLeft.run(now, clanRow.id, uid);
  return { clan: clanRow };
});
function leaveClan(gid, uid, now = Date.now()) {
  return leaveTx(String(gid), String(uid), now);
}

// ------------------------------------------------------------
// Invites, kicks and ranks
// ------------------------------------------------------------

function assertCanInvite(gid, actorId, targetId, now = Date.now()) {
  gid = String(gid);
  actorId = String(actorId);
  targetId = String(targetId);
  const { clan: clanRow, member } = requireMembership(gid, actorId);
  if (member.rank_no < RANK.SENIOR) throw new ClanError('Only Seniors and above can invite members.');
  if (clanRow.is_private && member.rank_no < CFG.PRIVATE_INVITE_MIN_RANK) {
    throw new ClanError(`**${clanRow.name}** is a private clan. Only ${RANK_NAMES[CFG.PRIVATE_INVITE_MIN_RANK]}s and above can invite people.`);
  }
  if (actorId === targetId) throw new ClanError('You cannot invite yourself.');
  if (S.getMember.get(gid, targetId)) throw new ClanError('That user is already in a clan.');
  const history = S.getHistory.get(clanRow.id, targetId);
  if (history?.banned) throw new ClanError(`<@${targetId}> is banned from **${clanRow.name}**.`);
  if (history?.left_at && now - history.left_at < CFG.REJOIN_LOCK_MS) {
    const wait = CFG.REJOIN_LOCK_MS - (now - history.left_at);
    throw new ClanError(`That user left your clan recently and can rejoin in **${economy.formatDuration(wait)}**.`);
  }
  if (S.countMembers.get(clanRow.id).n >= clanCapacity(clanRow)) {
    throw new ClanError('Your clan is full. Buy a Member Capacity upgrade to make more room.');
  }
  return { clan: clanRow, member };
}

const kickTx = db.transaction((gid, actorId, targetId, now) => {
  const { clan: clanRow, member: actor } = requireMembership(gid, actorId);
  const target = S.getMember.get(gid, targetId);
  if (!target || target.clan_id !== clanRow.id) throw new ClanError('That user is not in your clan.');
  if (actorId === targetId) throw new ClanError('You cannot kick yourself. Use the leave command instead.');
  if (actor.rank_no < RANK.SENIOR) throw new ClanError('Only Seniors and above can kick members.');
  if (actor.rank_no <= target.rank_no) throw new ClanError(`You cannot kick a ${RANK_NAMES[target.rank_no]}. You can only kick members who rank below you.`);
  S.delMember.run(gid, targetId);
  S.ensureHistory.run(clanRow.id, gid, targetId);
  S.setLeft.run(now, clanRow.id, targetId);
  return { clan: clanRow, target };
});
function kickMember(gid, actorId, targetId, now = Date.now()) {
  return kickTx(String(gid), String(actorId), String(targetId), now);
}

const rankTx = db.transaction((gid, actorId, targetId, newRank, expectedRank) => {
  const { clan: clanRow, member: actor } = requireMembership(gid, actorId);
  const target = S.getMember.get(gid, targetId);
  if (!target || target.clan_id !== clanRow.id) throw new ClanError('That user is not in your clan.');
  if (actorId === targetId) throw new ClanError('You cannot change your own rank.');
  if (target.rank_no >= RANK.OWNER) throw new ClanError("The owner's rank cannot be changed.");
  if (expectedRank && target.rank_no !== expectedRank) throw new ClanError(`That user is not a ${RANK_NAMES[expectedRank]}.`);
  if (!expectedRank && target.rank_no === newRank) throw new ClanError(`That user is already a ${RANK_NAMES[newRank]}.`);
  const touchesCoOwner = newRank === RANK.COOWNER || target.rank_no === RANK.COOWNER;
  const needed = touchesCoOwner ? RANK.OWNER : RANK.COOWNER;
  if (actor.rank_no < needed) {
    throw new ClanError(touchesCoOwner
      ? 'Only the Owner can appoint or remove Co-owners.'
      : 'Only Co-owners and the Owner can appoint and remove Managers and Seniors.');
  }
  if (actor.rank_no <= target.rank_no) throw new ClanError(`You cannot change the rank of a ${RANK_NAMES[target.rank_no]}.`);
  if (newRank === RANK.COOWNER && S.countRank.get(clanRow.id, RANK.COOWNER).n >= CFG.MAX_CO_OWNERS) {
    throw new ClanError(`A clan can have at most ${CFG.MAX_CO_OWNERS} Co-owners.`);
  }
  S.setRank.run(newRank, gid, targetId);
  return { clan: clanRow, from: target.rank_no, to: newRank };
});
function changeRank(gid, actorId, targetId, newRank, expectedRank = null) {
  return rankTx(String(gid), String(actorId), String(targetId), Number(newRank), expectedRank == null ? null : Number(expectedRank));
}

function setPrivate(gid, name, value) {
  const clanRow = getClanByName(gid, name);
  if (!clanRow) throw new ClanError(`I could not find a clan called "${String(name).trim()}".`);
  S.setPrivate.run(value ? 1 : 0, clanRow.id);
  return S.getClan.get(clanRow.id);
}

// ------------------------------------------------------------
// Vault
// ------------------------------------------------------------

const depositTx = db.transaction((gid, uid, amountRaw, now) => {
  const { clan: clanRow } = requireMembership(gid, uid);
  const wallet = economy.getBalance(gid, uid);
  const amount = String(amountRaw).toLowerCase() === 'all' ? wallet : Math.floor(Number(String(amountRaw).replace(/,/g, '')));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ClanError(String(amountRaw).toLowerCase() === 'all' ? 'Your wallet is empty.' : 'Enter a valid amount to deposit.');
  }
  if (wallet < amount) throw new ClanError(`You only have ${money(wallet)} in your wallet.`);
  const removed = economy.removeCrowns(gid, uid, amount, {
    type: 'clan_deposit',
    reason: `Clan vault deposit (${clanRow.name})`,
    actorId: uid,
    timestamp: now,
  });
  if (!removed) throw new ClanError(`You only have ${money(wallet)} in your wallet.`);
  S.addVault.run(amount, now, clanRow.id);
  S.memberDeposit.run(amount, now, gid, uid);
  S.addDonor.run(clanRow.id, uid, amount);
  S.insDeposit.run(clanRow.id, gid, uid, amount, now);
  const notes = {};
  ensureQuests(clanRow, now);
  recordMetric(clanRow.id, dayKey(now), uid, 'deposit', amount);
  evaluateQuests(clanRow.id, now, notes);
  return { clan: S.getClan.get(clanRow.id), amount, wallet: economy.getBalance(gid, uid), notes };
});
function deposit(gid, uid, amountRaw, now = Date.now()) {
  return depositTx(String(gid), String(uid), amountRaw, now);
}

function depositHistory(gid, uid, page = 0, size = 10, now = Date.now()) {
  const { clan: clanRow, member } = requireMembership(gid, uid);
  if (member.rank_no < RANK.SENIOR) throw new ClanError('Only Seniors and above can view the deposit history.');
  const since = now - CFG.DEPOSIT_HISTORY_DAYS * DAY_MS;
  const total = S.countDeposits.get(clanRow.id, since).n;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return {
    clan: clanRow,
    rows: S.recentDeposits.all(clanRow.id, since, size, current * size),
    total,
    pages,
    page: current,
    days: CFG.DEPOSIT_HISTORY_DAYS,
  };
}

// ------------------------------------------------------------
// Upgrades
// ------------------------------------------------------------

function upgradeView(gid, uid, now = Date.now()) {
  const { clan: clanRow, member } = requireMembership(gid, uid);
  const active = Number(clanRow.booster_until || 0) > now;
  return {
    clan: clanRow,
    member,
    members: S.countMembers.get(clanRow.id).n,
    capacity: clanCapacity(clanRow),
    boost: xpBoost(clanRow, now),
    booster: {
      active,
      tier: active ? clanRow.booster_tier : 0,
      until: active ? clanRow.booster_until : 0,
      tiers: CFG.XP_BOOSTER.map((tier, index) => ({ tier: index + 1, ...tier })),
    },
    cap: { tier: clanRow.capacity_tier, max: CFG.CAPACITY.length, next: CFG.CAPACITY[clanRow.capacity_tier] || null },
  };
}

const upgradeTx = db.transaction((gid, uid, kind, tierRaw, now) => {
  const { clan: clanRow, member } = requireMembership(gid, uid);
  if (member.rank_no < RANK.COOWNER) throw new ClanError('Only Co-owners and the Owner can buy upgrades.');
  const notes = {};

  if (kind === 'xp') {
    const tier = Math.floor(Number(tierRaw));
    const def = CFG.XP_BOOSTER[tier - 1];
    if (!def) throw new ClanError('That XP Booster does not exist.');
    const active = Number(clanRow.booster_until || 0) > now;
    if (active && clanRow.booster_tier > tier) {
      throw new ClanError(`XP Booster ${clanRow.booster_tier} is already active and is stronger than XP Booster ${tier}.`);
    }
    const sameTier = active && clanRow.booster_tier === tier;
    const until = sameTier
      ? clanRow.booster_until + CFG.XP_BOOSTER_DURATION_MS
      : now + CFG.XP_BOOSTER_DURATION_MS;
    if (until - now > CFG.XP_BOOSTER_MAX_STACK_MS) {
      throw new ClanError('That booster is already extended to the maximum time. Wait for it to run down before adding more.');
    }
    const spent = S.spendVault.run(def.cost, clanRow.id, def.cost);
    if (!spent.changes) throw new ClanError(`The vault needs ${money(def.cost)} for that upgrade, but it only has ${money(clanRow.vault)}.`);
    S.setBooster.run(tier, until, clanRow.id);
    addClanXp(clanRow.id, def.xp, notes);
    return { clan: S.getClan.get(clanRow.id), kind, tier, cost: def.cost, xp: def.xp, until, notes };
  }

  const next = CFG.CAPACITY[clanRow.capacity_tier];
  if (!next) throw new ClanError('Member capacity is already at its maximum.');
  const spent = S.spendVault.run(next.cost, clanRow.id, next.cost);
  if (!spent.changes) throw new ClanError(`The vault needs ${money(next.cost)} for that upgrade, but it only has ${money(clanRow.vault)}.`);
  S.bumpCapTier.run(clanRow.id);
  addClanXp(clanRow.id, next.xp, notes);
  return { clan: S.getClan.get(clanRow.id), kind: 'capacity', capacity: next.capacity, cost: next.cost, xp: next.xp, notes };
});

function buyUpgrade(gid, uid, kind, tier = 1, now = Date.now()) {
  return upgradeTx(String(gid), String(uid), kind === 'capacity' ? 'capacity' : 'xp', tier, now);
}

// ------------------------------------------------------------
// Logo and banner
// ------------------------------------------------------------

const EXT_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const EXT_BY_NAME = { '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp', '.gif': 'gif' };

function mediaPath(file) {
  if (!file) return null;
  const full = path.join(MEDIA_DIR, path.basename(String(file)));
  return fs.existsSync(full) ? full : null;
}

function removeFile(file) {
  const full = mediaPath(file);
  if (full) fs.unlink(full, () => {});
}

function download(url, maxBytes, redirects = 3) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch { reject(new ClanError('That image URL is invalid.')); return; }
    if (parsed.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(parsed.hostname.toLowerCase())) {
      reject(new ClanError('Only Discord-hosted attachments can be used.'));
      return;
    }

    const req = https.get(parsed, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
        response.resume();
        resolve(download(new URL(response.headers.location, parsed).toString(), maxBytes, redirects - 1));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new ClanError('I could not download that image. Try uploading it again.'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy();
          reject(new ClanError(`Images can be at most ${Math.floor(maxBytes / 1024 / 1024)} MB.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => reject(new ClanError('I could not download the image. Try again.')));
    });
    req.on('error', () => reject(new ClanError('I could not download the image. Try again.')));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new ClanError('Downloading the image timed out. Try again.'));
    });
  });
}

async function setMedia(gid, uid, kind, attachment) {
  const { clan: clanRow, member } = requireMembership(gid, uid);
  if (member.rank_no < RANK.COOWNER) throw new ClanError(`Only the Owner and Co-owners can change the clan ${kind}.`);
  if (!['logo', 'banner'].includes(kind)) throw new ClanError('Choose either a clan logo or banner.');
  const type = String(attachment.contentType || '').split(';')[0].trim().toLowerCase();
  const ext = EXT_BY_TYPE[type] || EXT_BY_NAME[path.extname(String(attachment.name || '')).toLowerCase()];
  if (!ext) throw new ClanError('Attach a PNG, JPG, WEBP or GIF image.');
  if (Number(attachment.size) > CFG.MAX_IMAGE_BYTES) throw new ClanError(`Images can be at most ${Math.floor(CFG.MAX_IMAGE_BYTES / 1024 / 1024)} MB.`);
  const buffer = await download(attachment.url, CFG.MAX_IMAGE_BYTES);
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const file = `${clanRow.id}_${kind}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, file), buffer);
  const old = kind === 'logo' ? clanRow.logo_file : clanRow.banner_file;
  if (kind === 'logo') S.setLogo.run(file, clanRow.id);
  else S.setBanner.run(file, clanRow.id);
  removeFile(old);
  return S.getClan.get(clanRow.id);
}

const CUSTOM_EMOJI = /^<a?:\w{2,32}:(\d{15,25})>$/;
const UNICODE_EMOJI = /^\p{Extended_Pictographic}[\p{Extended_Pictographic}\u200d\ufe0f\u{1F3FB}-\u{1F3FF}]*$/u;
function parseEmoji(raw) {
  const text = String(raw || '').trim();
  const custom = CUSTOM_EMOJI.exec(text);
  if (custom) return { text, url: `https://cdn.discordapp.com/emojis/${custom[1]}.${text.startsWith('<a:') ? 'gif' : 'png'}` };
  if (text.length <= 16 && UNICODE_EMOJI.test(text)) return { text, url: null };
  return null;
}

function setLogoEmoji(gid, uid, raw) {
  const { clan: clanRow, member } = requireMembership(gid, uid);
  if (member.rank_no < RANK.COOWNER) throw new ClanError('Only the Owner and Co-owners can change the clan logo.');
  const parsed = parseEmoji(raw);
  if (!parsed) throw new ClanError('That is not an emoji. Attach an image or send one emoji.');
  const old = clanRow.logo_file;
  S.setLogoEmoji.run(parsed.text, clanRow.id);
  removeFile(old);
  return S.getClan.get(clanRow.id);
}

// ------------------------------------------------------------
// Activity checks
// ------------------------------------------------------------

const deleteClanTx = db.transaction(clanId => {
  const clanRow = S.getClan.get(clanId);
  if (!clanRow) return null;
  S.delMembersOf.run(clanId);
  S.delDeposits.run(clanId);
  S.delQuests.run(clanId);
  S.delActors.run(clanId);
  S.delBonus.run(clanId);
  S.delStats.run(clanId);
  S.delStreaks.run(clanId);
  S.delHistory.run(clanId);
  S.delDonors.run(clanId);
  S.delClan.run(clanId);
  return clanRow;
});

const inactiveKickTx = db.transaction((clanId, gid, uid, now) => {
  S.delMember.run(gid, uid);
  S.ensureHistory.run(clanId, gid, uid);
  S.addInactiveKick.run(clanId, uid);
  S.setLeft.run(now, clanId, uid);
  const history = S.getHistory.get(clanId, uid);
  const banned = history.inactive_kicks >= CFG.INACTIVE_KICKS_BEFORE_BAN;
  if (banned) S.setBanned.run(clanId, uid);
  return { banned };
});

function sweep(now = Date.now()) {
  const events = { deletedClans: [], kicked: [] };
  S.pruneDeposits.run(now - (CFG.DEPOSIT_HISTORY_DAYS + 1) * DAY_MS);
  const oldDay = dayKey(now - 3 * DAY_MS);
  S.pruneStats.run(oldDay);
  S.prunePool.run(oldDay);

  for (const clanRow of S.allClans.all()) {
    if (CFG.EXEMPT_PRIVATE_FROM_INACTIVITY && clanRow.is_private) continue;
    const lastActivity = Math.max(clanRow.last_deposit_at || 0, clanRow.created_at || 0);
    if (now - lastActivity >= CFG.INACTIVE_CLAN_MS) {
      const deleted = deleteClanTx(clanRow.id);
      if (deleted) {
        removeFile(deleted.logo_file);
        removeFile(deleted.banner_file);
        events.deletedClans.push(deleted);
      }
      continue;
    }

    for (const member of S.membersOf.all(clanRow.id)) {
      if (member.rank_no >= RANK.OWNER) continue;
      const base = Math.max(member.last_deposit_at || 0, member.joined_at || 0);
      if (now - base < CFG.INACTIVE_MEMBER_MS) continue;
      const { banned } = inactiveKickTx(clanRow.id, member.guild_id, member.user_id, now);
      events.kicked.push({ userId: member.user_id, guildId: member.guild_id, clanName: clanRow.name, banned });
    }
  }
  return events;
}

async function notify(client, events) {
  const sendTo = async (userId, content, guildId = null) => {
    try {
      if (CFG.NOTIFY_CHANNEL_ID && guildId) {
        const channel = await client.channels.fetch(String(CFG.NOTIFY_CHANNEL_ID)).catch(() => null);
        if (channel?.send && String(channel.guildId) === String(guildId)) {
          await channel.send({ content, allowedMentions: { users: [String(userId)] } });
          return;
        }
      }
      const user = await client.users.fetch(String(userId));
      await user.send(content);
    } catch {
      // DMs may be closed; the cleanup remains committed.
    }
  };
  const days = Math.round(CFG.INACTIVE_CLAN_MS / DAY_MS);
  for (const deleted of events.deletedClans) {
    await sendTo(deleted.owner_id, `Your clan **${deleted.name}** was deleted because nobody made a vault deposit for ${days} days.`);
  }
  for (const kick of events.kicked) {
    await sendTo(
      kick.userId,
      kick.banned
        ? `<@${kick.userId}>, you have been kicked from **${kick.clanName}** for the 2nd time. You are banned from joining this clan.`
        : `<@${kick.userId}>, you have been kicked from **${kick.clanName}** due to inactivity.`,
      kick.guildId
    );
  }
}

function runSweep(client) {
  try {
    invitesPruneSafe();
    const events = sweep();
    if (events.deletedClans.length || events.kicked.length) notify(client, events).catch(() => {});
  } catch (error) {
    console.error('[Clan] Activity sweep failed:', error);
  }
}

function init(client) {
  if (client._clanReady) return module.exports;
  client._clanReady = true;
  client.clanSystem = module.exports;
  invitesPruneSafe();
  const first = setTimeout(() => runSweep(client), 30 * 1000);
  first.unref?.();
  client._clanSweepInterval = setInterval(() => runSweep(client), CFG.SWEEP_INTERVAL_MS);
  client._clanSweepInterval.unref?.();
  return module.exports;
}

function invitesPruneSafe() {
  // The persistent invite module may not have been required yet.
  try {
    require('./clanInvites').prune();
  } catch (error) {
    console.error('[Clan] Could not prune expired invites:', error);
  }
}

function close(client = null) {
  if (client?._clanSweepInterval) clearInterval(client._clanSweepInterval);
  try {
    if (shopDb.open) shopDb.close();
  } catch {}
}

module.exports = {
  ClanError,
  RANK,
  RANK_NAMES,
  init,
  close,
  sweep,
  cleanName,
  assertNameFree,
  getMembership,
  requireMembership,
  getClanByName,
  describeClan,
  clanCapacity,
  xpBoost,
  getLeaderboard,
  createFromVoucher,
  renameClan,
  joinClan,
  joinByName,
  leaveClan,
  assertCanInvite,
  kickMember,
  changeRank,
  setPrivate,
  deposit,
  depositHistory,
  getQuestBoard,
  questText,
  recordGame,
  recordFarm,
  trackGame,
  trackFarm,
  announce,
  upgradeView,
  buyUpgrade,
  setMedia,
  setLogoEmoji,
  parseEmoji,
  mediaPath,
};
