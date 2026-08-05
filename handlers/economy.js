const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const BASE_PASSIVE_REWARD = 30;
const PASSIVE_COOLDOWN_MS = 60_000;
const BOOST_MULTIPLIER = 2;

const WEEKLY_GROSS_REWARDS = [24000, 12000, 8000];
const WEEKLY_TAX_RATE = 0.08;

const MONTHLY_GROSS_REWARDS = [200000, 150000, 100000];
const MONTHLY_TAX_RATE = 0.12;

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'economy.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

function ensureSchema() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS economy_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      lifetime_earned INTEGER NOT NULL DEFAULT 0,
      lifetime_spent INTEGER NOT NULL DEFAULT 0,
      last_reward_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      PRIMARY KEY (guild_id, user_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS economy_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      actor_id TEXT,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT,
      timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS economy_boosts (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      multiplier INTEGER NOT NULL DEFAULT 2,
      purchased_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      cooldown_until INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_tracker_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      period_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      placement INTEGER NOT NULL,
      gross_payout INTEGER NOT NULL DEFAULT 0,
      tax_amount INTEGER NOT NULL DEFAULT 0,
      net_payout INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      UNIQUE(guild_id, scope, period_key, user_id)
    )
  `).run();
}

ensureSchema();

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO economy_users (
    guild_id, user_id, balance, lifetime_earned, lifetime_spent, last_reward_at, created_at
  )
  VALUES (?, ?, 0, 0, 0, 0, ?)
`);

const getUser = db.prepare(`
  SELECT *
  FROM economy_users
  WHERE guild_id = ? AND user_id = ?
`);

const updateAdd = db.prepare(`
  UPDATE economy_users
  SET balance = balance + ?,
      lifetime_earned = lifetime_earned + ?
  WHERE guild_id = ? AND user_id = ?
`);

const updateRemove = db.prepare(`
  UPDATE economy_users
  SET balance = balance - ?,
      lifetime_spent = lifetime_spent + ?
  WHERE guild_id = ? AND user_id = ?
`);

const updateRewardAt = db.prepare(`
  UPDATE economy_users
  SET last_reward_at = ?
  WHERE guild_id = ? AND user_id = ?
`);

const insertTx = db.prepare(`
  INSERT INTO economy_transactions (
    guild_id, user_id, actor_id, type, amount, reason, timestamp
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertBoost = db.prepare(`
  INSERT INTO economy_boosts (
    guild_id, user_id, multiplier, purchased_at, expires_at, cooldown_until
  )
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET
    multiplier = excluded.multiplier,
    purchased_at = excluded.purchased_at,
    expires_at = excluded.expires_at,
    cooldown_until = excluded.cooldown_until
`);

const deleteExpiredBoosts = db.prepare(`
  DELETE FROM economy_boosts
  WHERE expires_at <= ?
`);

const getBoost = db.prepare(`
  SELECT *
  FROM economy_boosts
  WHERE guild_id = ? AND user_id = ?
`);

const getTopBalances = db.prepare(`
  SELECT user_id, balance, lifetime_earned, lifetime_spent, last_reward_at
  FROM economy_users
  WHERE guild_id = ? AND balance > 0
  ORDER BY balance DESC, lifetime_earned DESC, last_reward_at DESC, user_id ASC
  LIMIT ? OFFSET ?
`);

const countPositiveBalances = db.prepare(`
  SELECT COUNT(*) AS count
  FROM economy_users
  WHERE guild_id = ? AND balance > 0
`);

const getRankStmt = db.prepare(`
  SELECT COUNT(*) + 1 AS rank
  FROM economy_users
  WHERE guild_id = ? AND balance > ?
`);

function ensureUser(guildId, userId, ts = Date.now()) {
  insertUser.run(String(guildId), String(userId), Number(ts));
  return getUser.get(String(guildId), String(userId));
}

function getUserStats(guildId, userId) {
  const row = getUser.get(String(guildId), String(userId));
  return row || {
    guild_id: String(guildId),
    user_id: String(userId),
    balance: 0,
    lifetime_earned: 0,
    lifetime_spent: 0,
    last_reward_at: 0,
    created_at: 0,
  };
}

function getBalance(guildId, userId) {
  return getUserStats(guildId, userId).balance || 0;
}

function addCrowns(guildId, userId, amount, meta = {}) {
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const gid = String(guildId);
  const uid = String(userId);
  const now = Number(meta.timestamp ?? Date.now());

  ensureUser(gid, uid, now);

  updateAdd.run(amount, amount, gid, uid);
  insertTx.run(
    gid,
    uid,
    meta.actorId ? String(meta.actorId) : null,
    meta.type || 'add',
    amount,
    meta.reason || null,
    now
  );

  return getUserStats(gid, uid);
}

function removeCrowns(guildId, userId, amount, meta = {}) {
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const gid = String(guildId);
  const uid = String(userId);
  const now = Number(meta.timestamp ?? Date.now());

  ensureUser(gid, uid, now);

  const current = getBalance(gid, uid);
  if (current < amount) return null;

  updateRemove.run(amount, amount, gid, uid);
  insertTx.run(
    gid,
    uid,
    meta.actorId ? String(meta.actorId) : null,
    meta.type || 'remove',
    amount,
    meta.reason || null,
    now
  );

  return getUserStats(gid, uid);
}

function getPassiveMultiplier(guildId, userId, now = Date.now()) {
  deleteExpiredBoosts.run(now);

  const boost = getBoost.get(String(guildId), String(userId));
  if (!boost) return 1;

  if (boost.expires_at <= now) {
    return 1;
  }

  return Math.max(1, Number(boost.multiplier) || 1);
}

function rewardPassiveMessage(client, message, timestamp = Date.now()) {
  if (!message?.guild || !message?.author) return 0;
  if (message.author.bot || message.webhookId) return 0;
  if (message.commandName) return 0;

  const guildId = String(message.guild.id);
  const userId = String(message.author.id);
  const now = Number(timestamp);

  ensureUser(guildId, userId, now);
  const row = getUserStats(guildId, userId);

  if (row.last_reward_at && now - row.last_reward_at < PASSIVE_COOLDOWN_MS) {
    return 0;
  }

  const multiplier = getPassiveMultiplier(guildId, userId, now);
  const reward = BASE_PASSIVE_REWARD * multiplier;

  db.transaction(() => {
    updateAdd.run(reward, reward, guildId, userId);
    updateRewardAt.run(now, guildId, userId);
    insertTx.run(
      guildId,
      userId,
      null,
      'message_reward',
      reward,
      `Passive message reward${multiplier > 1 ? ` x${multiplier}` : ''}`,
      now
    );
  })();

  return reward;
}

function getLeaderboard(guildId, limit = 10, offset = 0) {
  return getTopBalances.all(String(guildId), Number(limit), Number(offset));
}

function getRank(guildId, userId) {
  const row = getUserStats(guildId, userId);
  const balance = Number(row.balance || 0);
  if (balance <= 0) return null;

  const result = getRankStmt.get(String(guildId), balance);
  return result?.rank || null;
}

function getEconomySummary(guildId) {
  return countPositiveBalances.get(String(guildId)) || { count: 0 };
}

function setBoost(guildId, userId, durationMs = 0, multiplier = BOOST_MULTIPLIER) {
  const now = Date.now();
  const expiresAt = now + Math.max(0, Number(durationMs) || 0);
  const cooldownUntil = expiresAt + 5 * 24 * 60 * 60 * 1000;

  insertBoost.run(
    String(guildId),
    String(userId),
    Number(multiplier) || BOOST_MULTIPLIER,
    now,
    expiresAt,
    cooldownUntil
  );

  return getBoost.get(String(guildId), String(userId));
}

function getBoostStatus(guildId, userId) {
  deleteExpiredBoosts.run(Date.now());
  return getBoost.get(String(guildId), String(userId)) || null;
}

function maybePayoutLeaderboard(client, guildId, scope, periodKey) {
  const normalizedScope = String(scope).toLowerCase();
  const rewards =
    normalizedScope === 'weekly'
      ? WEEKLY_GROSS_REWARDS
      : normalizedScope === 'monthly'
        ? MONTHLY_GROSS_REWARDS
        : null;

  const taxRate =
    normalizedScope === 'weekly'
      ? WEEKLY_TAX_RATE
      : normalizedScope === 'monthly'
        ? MONTHLY_TAX_RATE
        : 0;

  if (!rewards) return [];

  const rows = db.prepare(`
    SELECT user_id, ${normalizedScope} AS score
    FROM message_stats
    WHERE guild_id = ? AND ${normalizedScope} > 0
    ORDER BY ${normalizedScope} DESC, total DESC, last_message_at DESC, user_id ASC
    LIMIT 3
  `).all(String(guildId));

  if (!rows.length) return [];

  const createdAt = Date.now();
  const payouts = [];

  db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const gross = Number(rewards[i] || 0);
      if (gross <= 0) continue;

      const tax = Math.round(gross * taxRate);
      const net = gross - tax;

      if (client?.economy?.addCrowns) {
        client.economy.addCrowns(guildId, row.user_id, net, {
          type: `${normalizedScope}_leaderboard_payout`,
          reason: `${normalizedScope} leaderboard payout`,
          timestamp: createdAt,
        });
      }

      db.prepare(`
        INSERT OR IGNORE INTO message_tracker_history (
          guild_id, scope, period_key, user_id, placement, gross_payout, tax_amount, net_payout, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(guildId),
        normalizedScope,
        String(periodKey || ''),
        String(row.user_id),
        i + 1,
        gross,
        tax,
        net,
        createdAt
      );

      payouts.push({
        userId: String(row.user_id),
        placement: i + 1,
        gross,
        tax,
        net,
      });
    }
  })();

  return payouts;
}

function init(client) {
  if (client._economyReady) return module.exports;

  client._economyReady = true;
  client.economyDB = db;
  client.economy = module.exports;

  return module.exports;
}

module.exports = {
  init,
  db,
  BASE_PASSIVE_REWARD,
  PASSIVE_COOLDOWN_MS,
  addCrowns,
  removeCrowns,
  getBalance,
  getUserStats,
  getLeaderboard,
  getRank,
  getEconomySummary,
  rewardPassiveMessage,
  getPassiveMultiplier,
  setBoost,
  getBoostStatus,
  maybePayoutLeaderboard,
};