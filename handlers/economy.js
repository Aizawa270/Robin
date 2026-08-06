const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let config = null;
try {
  config = require('../config');
} catch {}

const BASE_PASSIVE_REWARD = 30;
const PASSIVE_COOLDOWN_MS = 60_000;
const BOOST_MULTIPLIER = 2;

const WEEKLY_GROSS_REWARDS = [24000, 12000, 8000];
const WEEKLY_TAX_RATE = 0.08;

const MONTHLY_GROSS_REWARDS = [200000, 150000, 100000];
const MONTHLY_TAX_RATE = 0.12;

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6

const BUILTIN_JOBS = [
  { id: '01', name: 'Janitor', level: 1, worksPerDay: 2, cooldownMs: 12 * 60 * 60 * 1000 },
  { id: '02', name: 'Cashier', level: 15, worksPerDay: 2, cooldownMs: 12 * 60 * 60 * 1000 },
  { id: '03', name: 'Chef', level: 30, worksPerDay: 2, cooldownMs: 12 * 60 * 60 * 1000 },
  { id: '04', name: 'Teacher', level: 40, worksPerDay: 1, cooldownMs: 24 * 60 * 60 * 1000 },
  { id: '05', name: 'Police Officer', level: 60, worksPerDay: 1, cooldownMs: 24 * 60 * 60 * 1000 },
  { id: '06', name: 'Scientist', level: 70, worksPerDay: 1, cooldownMs: 24 * 60 * 60 * 1000 },
  { id: '07', name: 'Pilot', level: 80, worksPerDay: 1, cooldownMs: 24 * 60 * 60 * 1000 },
  { id: '08', name: 'CEO', level: 90, worksPerDay: 1, cooldownMs: 24 * 60 * 60 * 1000 },
  { id: '09', name: 'Surgeon', level: 100, worksPerDay: 1, cooldownMs: 24 * 60 * 60 * 1000 },
];

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
      lifetime_tax_paid INTEGER NOT NULL DEFAULT 0,
      last_reward_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      current_job_id TEXT,
      work_streak INTEGER NOT NULL DEFAULT 0,
      last_work_day_key TEXT,
      today_work_day_key TEXT,
      today_work_count INTEGER NOT NULL DEFAULT 0,
      total_shifts_worked INTEGER NOT NULL DEFAULT 0,
      last_work_at INTEGER NOT NULL DEFAULT 0,
      last_job_switch_at INTEGER NOT NULL DEFAULT 0,
      current_job_started_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `).run();

  const addColumn = (table, columnSql) => {
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`).run();
    } catch {}
  };

  addColumn('economy_users', 'lifetime_tax_paid INTEGER NOT NULL DEFAULT 0');
  addColumn('economy_users', 'current_job_id TEXT');
  addColumn('economy_users', 'work_streak INTEGER NOT NULL DEFAULT 0');
  addColumn('economy_users', 'last_work_day_key TEXT');
  addColumn('economy_users', 'today_work_day_key TEXT');
  addColumn('economy_users', 'today_work_count INTEGER NOT NULL DEFAULT 0');
  addColumn('economy_users', 'total_shifts_worked INTEGER NOT NULL DEFAULT 0');
  addColumn('economy_users', 'last_work_at INTEGER NOT NULL DEFAULT 0');
  addColumn('economy_users', 'last_job_switch_at INTEGER NOT NULL DEFAULT 0');
  addColumn('economy_users', 'current_job_started_at INTEGER NOT NULL DEFAULT 0');

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

  db.prepare(`
    CREATE TABLE IF NOT EXISTS economy_server_banks (
      guild_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      total_tax_collected INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS economy_tax_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT,
      source TEXT NOT NULL,
      gross INTEGER NOT NULL DEFAULT 0,
      tax INTEGER NOT NULL DEFAULT 0,
      net INTEGER NOT NULL DEFAULT 0,
      bank_added INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS economy_jobs (
      guild_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      required_role_id TEXT,
      shift_pay INTEGER NOT NULL DEFAULT 0,
      weekly_bonus INTEGER NOT NULL DEFAULT 0,
      works_per_day INTEGER NOT NULL DEFAULT 1,
      cooldown_ms INTEGER NOT NULL DEFAULT 86400000,
      updated_by TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, job_id)
    )
  `).run();
}

ensureSchema();

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO economy_users (
    guild_id, user_id, balance, lifetime_earned, lifetime_spent, lifetime_tax_paid,
    last_reward_at, created_at,
    current_job_id, work_streak, last_work_day_key, today_work_day_key, today_work_count,
    total_shifts_worked, last_work_at, last_job_switch_at, current_job_started_at
  )
  VALUES (?, ?, 0, 0, 0, 0, 0, ?, NULL, 0, NULL, NULL, 0, 0, 0, 0, 0)
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

const updateTaxPaid = db.prepare(`
  UPDATE economy_users
  SET lifetime_tax_paid = lifetime_tax_paid + ?
  WHERE guild_id = ? AND user_id = ?
`);

const updateWorkState = db.prepare(`
  UPDATE economy_users
  SET current_job_id = ?,
      work_streak = ?,
      last_work_day_key = ?,
      today_work_day_key = ?,
      today_work_count = ?,
      total_shifts_worked = total_shifts_worked + ?,
      last_work_at = ?,
      last_job_switch_at = COALESCE(last_job_switch_at, 0),
      current_job_started_at = COALESCE(current_job_started_at, 0)
  WHERE guild_id = ? AND user_id = ?
`);

const updateJobAssign = db.prepare(`
  UPDATE economy_users
  SET current_job_id = ?,
      current_job_started_at = ?,
      last_job_switch_at = ?
  WHERE guild_id = ? AND user_id = ?
`);

const clearJobAssign = db.prepare(`
  UPDATE economy_users
  SET current_job_id = NULL,
      work_streak = 0,
      last_work_day_key = NULL,
      today_work_day_key = NULL,
      today_work_count = 0,
      current_job_started_at = 0
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
  SELECT user_id, balance, lifetime_earned, lifetime_spent, lifetime_tax_paid, last_reward_at
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

const ensureBank = db.prepare(`
  INSERT OR IGNORE INTO economy_server_banks (guild_id, balance, total_tax_collected, updated_at)
  VALUES (?, 0, 0, ?)
`);

const getBankStmt = db.prepare(`
  SELECT *
  FROM economy_server_banks
  WHERE guild_id = ?
`);

const updateBankAdd = db.prepare(`
  UPDATE economy_server_banks
  SET balance = balance + ?,
      total_tax_collected = total_tax_collected + ?,
      updated_at = ?
  WHERE guild_id = ?
`);

const updateBankRemove = db.prepare(`
  UPDATE economy_server_banks
  SET balance = MAX(0, balance - ?),
      updated_at = ?
  WHERE guild_id = ?
`);

const insertTaxHistory = db.prepare(`
  INSERT INTO economy_tax_history (
    guild_id, user_id, source, gross, tax, net, bank_added, note, timestamp
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertJob = db.prepare(`
  INSERT INTO economy_jobs (
    guild_id, job_id, enabled, required_role_id, shift_pay, weekly_bonus, works_per_day, cooldown_ms, updated_by, updated_at
  )
  VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(guild_id, job_id) DO UPDATE SET
    enabled = 1,
    required_role_id = excluded.required_role_id,
    shift_pay = excluded.shift_pay,
    weekly_bonus = excluded.weekly_bonus,
    works_per_day = excluded.works_per_day,
    cooldown_ms = excluded.cooldown_ms,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
`);

const disableJobStmt = db.prepare(`
  UPDATE economy_jobs
  SET enabled = 0, updated_by = ?, updated_at = ?
  WHERE guild_id = ? AND job_id = ?
`);

const resetJobStmt = db.prepare(`
  DELETE FROM economy_jobs
  WHERE guild_id = ? AND job_id = ?
`);

const getJobStmt = db.prepare(`
  SELECT *
  FROM economy_jobs
  WHERE guild_id = ? AND job_id = ?
`);

const getJobsStmt = db.prepare(`
  SELECT *
  FROM economy_jobs
  WHERE guild_id = ?
  ORDER BY CAST(job_id AS INTEGER) ASC
`);

function normalizeDateKey(ts = Date.now()) {
  const d = new Date(ts + TZ_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function previousDateKey(ts = Date.now()) {
  return normalizeDateKey(ts - DAY_MS);
}

function currencyEmoji() {
  return config?.currency?.emoji || '';
}

function currencyName() {
  return config?.currency?.name || 'Crowns';
}

function formatCurrency(amount) {
  const value = Number(amount || 0).toLocaleString('en-US');
  const name = currencyName();
  const emoji = currencyEmoji();
  return emoji ? `${value} ${name} ${emoji}` : `${value} ${name}`;
}

function formatDuration(ms) {
  ms = Math.max(0, Number(ms) || 0);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec || parts.length === 0) parts.push(`${sec}s`);
  return parts.join(' ');
}

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
    lifetime_tax_paid: 0,
    last_reward_at: 0,
    created_at: 0,
    current_job_id: null,
    work_streak: 0,
    last_work_day_key: null,
    today_work_day_key: null,
    today_work_count: 0,
    total_shifts_worked: 0,
    last_work_at: 0,
    last_job_switch_at: 0,
    current_job_started_at: 0,
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

  if (boost.expires_at <= now) return 1;
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

function getServerBank(guildId) {
  const gid = String(guildId);
  ensureBank.run(gid, Date.now());
  return getBankStmt.get(gid) || {
    guild_id: gid,
    balance: 0,
    total_tax_collected: 0,
    updated_at: 0,
  };
}

function addServerBank(guildId, amount, meta = {}) {
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const gid = String(guildId);
  const now = Number(meta.timestamp ?? Date.now());
  ensureBank.run(gid, now);
  updateBankAdd.run(amount, amount, now, gid);

  return getServerBank(gid);
}

function removeServerBank(guildId, amount) {
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const gid = String(guildId);
  const now = Date.now();
  ensureBank.run(gid, now);
  updateBankRemove.run(amount, now, gid);

  return getServerBank(gid);
}

function recordTax(guildId, userId, source, gross, tax, net, bankAdded, note, timestamp = Date.now()) {
  const gid = String(guildId);
  const uid = userId ? String(userId) : null;
  const ts = Number(timestamp);

  insertTaxHistory.run(
    gid,
    uid,
    String(source || 'unknown'),
    Number(gross) || 0,
    Number(tax) || 0,
    Number(net) || 0,
    Number(bankAdded) || 0,
    note || null,
    ts
  );

  if (bankAdded > 0) addServerBank(gid, bankAdded, { timestamp: ts });
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

function normalizeJobId(jobId) {
  const raw = String(jobId || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(2, '0').slice(-2);
}

function getBuiltinJob(jobId) {
  const id = normalizeJobId(jobId);
  if (!id) return null;
  return BUILTIN_JOBS.find(j => j.id === id) || null;
}

function getJobConfig(guildId, jobId) {
  const base = getBuiltinJob(jobId);
  if (!base) return null;

  const row = getJobStmt.get(String(guildId), base.id);
  return {
    ...base,
    configured: !!row && Number(row.enabled) === 1,
    enabled: row ? Number(row.enabled) === 1 : false,
    required_role_id: row?.required_role_id || null,
    shift_pay: row ? Number(row.shift_pay || 0) : 0,
    weekly_bonus: row ? Number(row.weekly_bonus || 0) : 0,
    works_per_day: row ? Number(row.works_per_day || base.worksPerDay) : base.worksPerDay,
    cooldown_ms: row ? Number(row.cooldown_ms || base.cooldownMs) : base.cooldownMs,
    updated_by: row?.updated_by || null,
    updated_at: row?.updated_at || 0,
  };
}

function listJobs(guildId) {
  const gid = String(guildId);
  const configured = getJobsStmt.all(gid);
  const map = new Map(configured.map(j => [String(j.job_id).padStart(2, '0'), j]));

  return BUILTIN_JOBS.map(job => {
    const row = map.get(job.id);
    return {
      ...job,
      configured: !!row && Number(row.enabled) === 1,
      enabled: row ? Number(row.enabled) === 1 : false,
      required_role_id: row?.required_role_id || null,
      shift_pay: row ? Number(row.shift_pay || 0) : 0,
      weekly_bonus: row ? Number(row.weekly_bonus || 0) : 0,
      works_per_day: row ? Number(row.works_per_day || job.worksPerDay) : job.worksPerDay,
      cooldown_ms: row ? Number(row.cooldown_ms || job.cooldownMs) : job.cooldownMs,
    };
  });
}

function setupJob(guildId, jobId, requiredRoleId, shiftPay, weeklyBonus, updatedBy = null) {
  const job = getBuiltinJob(jobId);
  if (!job) return null;

  const gid = String(guildId);
  const now = Date.now();

  insertJob.run(
    gid,
    job.id,
    String(requiredRoleId || '').trim() || null,
    Math.floor(Number(shiftPay) || 0),
    Math.floor(Number(weeklyBonus) || 0),
    job.worksPerDay,
    job.cooldownMs,
    updatedBy ? String(updatedBy) : null,
    now
  );

  return getJobConfig(gid, job.id);
}

function disableJob(guildId, jobId, updatedBy = null) {
  const job = getBuiltinJob(jobId);
  if (!job) return null;

  const gid = String(guildId);
  const now = Date.now();
  disableJobStmt.run(updatedBy ? String(updatedBy) : null, now, gid, job.id);
  return getJobConfig(gid, job.id);
}

function resetJob(guildId, jobId) {
  const job = getBuiltinJob(jobId);
  if (!job) return null;

  const gid = String(guildId);
  resetJobStmt.run(gid, job.id);
  return getJobConfig(gid, job.id);
}

function getUserJobState(guildId, userId) {
  return getUserStats(guildId, userId);
}

function setCurrentJob(guildId, userId, jobId, now = Date.now()) {
  const gid = String(guildId);
  const uid = String(userId);
  ensureUser(gid, uid, now);

  updateJobAssign.run(normalizeJobId(jobId), now, now, gid, uid);
  return getUserStats(gid, uid);
}

function startJob(guildId, userId, jobId, options = {}) {
  const now = Number(options.timestamp ?? Date.now());
  const gid = String(guildId);
  const uid = String(userId);

  ensureUser(gid, uid, now);

  const current = getUserStats(gid, uid);
  const normalized = normalizeJobId(jobId);
  const job = getJobConfig(gid, normalized);

  if (!job) {
    return { ok: false, code: 'unknown_job', message: 'That job does not exist.' };
  }

  if (!job.configured || !job.enabled) {
    return { ok: false, code: 'not_configured', message: 'This job has not been configured yet.' };
  }

  if (options.member && job.required_role_id) {
    const hasRole = options.member.roles?.cache?.has(job.required_role_id);
    if (!hasRole) {
      return {
        ok: false,
        code: 'missing_role',
        message: `You need the required level role to become a ${job.name}.`,
        requiredRoleId: job.required_role_id,
      };
    }
  }

  if (current.current_job_id && String(current.current_job_id) === String(job.id)) {
    return {
      ok: false,
      code: 'already_job',
      message: `You are already employed as ${job.name}.`,
      job,
    };
  }

  if (current.current_job_id && current.last_job_switch_at) {
    const elapsed = now - Number(current.last_job_switch_at || 0);
    if (elapsed < 24 * 60 * 60 * 1000) {
      return {
        ok: false,
        code: 'switch_cooldown',
        message: `You can switch jobs again in **${formatDuration(24 * 60 * 60 * 1000 - elapsed)}**.`,
      };
    }
  }

  setCurrentJob(gid, uid, job.id, now);

  return {
    ok: true,
    job,
    user: getUserStats(gid, uid),
  };
}

function quitJob(guildId, userId, now = Date.now()) {
  const gid = String(guildId);
  const uid = String(userId);

  ensureUser(gid, uid, now);
  clearJobAssign.run(gid, uid);
  return getUserStats(gid, uid);
}

function canWorkToday(userRow, jobRow, now = Date.now()) {
  const todayKey = normalizeDateKey(now);
  const currentCount = Number(userRow.today_work_count || 0);

  if (userRow.today_work_day_key !== todayKey) {
    return true;
  }

  return currentCount < Number(jobRow.works_per_day || 1);
}

function workShift(client, guildId, userId, member, now = Date.now()) {
  const gid = String(guildId);
  const uid = String(userId);

  ensureUser(gid, uid, now);

  const user = getUserStats(gid, uid);
  if (!user.current_job_id) {
    return { ok: false, code: 'no_job', message: 'You do not have a job yet.' };
  }

  const job = getJobConfig(gid, user.current_job_id);
  if (!job || !job.configured || !job.enabled) {
    return { ok: false, code: 'job_disabled', message: 'Your current job is not available right now.' };
  }

  if (member && job.required_role_id) {
    const hasRole = member.roles?.cache?.has(job.required_role_id);
    if (!hasRole) {
      return {
        ok: false,
        code: 'missing_role',
        message: `You need the required level role to work as ${job.name}.`,
      };
    }
  }

  if (!canWorkToday(user, job, now)) {
    return {
      ok: false,
      code: 'daily_limit',
      message: `You have already worked the maximum number of times for **${job.name}** today.`,
    };
  }

  const cooldownRemaining = Number(job.cooldown_ms || DAY_MS) - (now - Number(user.last_work_at || 0));
  if (user.last_work_at && cooldownRemaining > 0) {
    return {
      ok: false,
      code: 'cooldown',
      message: `You can work again in **${formatDuration(cooldownRemaining)}**.`,
    };
  }

  const todayKey = normalizeDateKey(now);
  const yesterdayKey = previousDateKey(now);

  let streak = Number(user.work_streak || 0);
  const sameDay = user.today_work_day_key === todayKey;

  if (!sameDay) {
    if (user.last_work_day_key === yesterdayKey) {
      streak += 1;
    } else {
      streak = 1;
    }
  }

  const grossShift = Number(job.shift_pay || 0);
  if (grossShift <= 0) {
    return {
      ok: false,
      code: 'not_setup',
      message: 'This job has not been configured yet.',
      job,
    };
  }

  const shiftTax = Math.round(grossShift * 0.10);
  const shiftNet = grossShift - shiftTax;

  const streakBonusTriggered = !sameDay && streak >= 7;
  const grossBonus = streakBonusTriggered ? Number(job.weekly_bonus || 0) : 0;
  const bonusTax = grossBonus > 0 ? Math.round(grossBonus * 0.08) : 0;
  const bonusNet = grossBonus - bonusTax;

  const newTodayCount = sameDay ? Number(user.today_work_count || 0) + 1 : 1;
  const nextStreak = streakBonusTriggered ? 0 : streak;

  db.transaction(() => {
    addCrowns(gid, uid, shiftNet, {
      type: 'job_work',
      reason: `${job.name} shift payout`,
      timestamp: now,
    });

    updateAddTaxAndState(gid, uid, shiftTax, shiftNet, shiftBonus = false);
  })();

  return performWorkUpdate({
    guildId: gid,
    userId: uid,
    job,
    now,
    user,
    todayKey,
    yesterdayKey,
    streak,
    streakBonusTriggered,
    grossShift,
    shiftTax,
    shiftNet,
    grossBonus,
    bonusTax,
    bonusNet,
    newTodayCount,
    nextStreak,
  });
}

function performWorkUpdate({
  guildId,
  userId,
  job,
  now,
  user,
  todayKey,
  streakBonusTriggered,
  grossShift,
  shiftTax,
  shiftNet,
  grossBonus,
  bonusTax,
  bonusNet,
  newTodayCount,
  nextStreak,
}) {
  // keep the transaction small and explicit
  updateWorkState.run(
    user.current_job_id,
    nextStreak,
    todayKey,
    todayKey,
    newTodayCount,
    1,
    now,
    guildId,
    userId
  );

  updateTaxPaid.run(shiftTax + bonusTax, guildId, userId);

  addServerBank(guildId, shiftTax, { timestamp: now });
  recordTax(
    guildId,
    userId,
    'work_tax',
    grossShift,
    shiftTax,
    shiftNet,
    shiftTax,
    `${job.name} shift tax`,
    now
  );

  const result = {
    ok: true,
    job,
    grossShift,
    shiftTax,
    shiftNet,
    bonusGross: grossBonus,
    bonusTax,
    bonusNet,
    streak: nextStreak,
    todayCount: newTodayCount,
    streakBonusTriggered,
    user: getUserStats(guildId, userId),
  };

  if (streakBonusTriggered && grossBonus > 0) {
    addCrowns(guildId, userId, bonusNet, {
      type: 'job_weekly_bonus',
      reason: `${job.name} 7-day streak bonus`,
      timestamp: now,
    });

    addServerBank(guildId, bonusTax, { timestamp: now });
    recordTax(
      guildId,
      userId,
      'weekly_streak_bonus',
      grossBonus,
      bonusTax,
      bonusNet,
      bonusTax,
      `${job.name} 7-day bonus tax`,
      now
    );
  }

  return result;
}

function updateAddTaxAndState(guildId, userId, shiftTax, shiftNet, shiftBonus = false) {
  void shiftTax;
  void shiftNet;
  void shiftBonus;
}

function getSalaryInfo(guildId, userId) {
  const user = getUserStats(guildId, userId);
  if (!user.current_job_id) return null;
  return getJobConfig(guildId, user.current_job_id);
}

function getTaxHistory(guildId, limit = 10, offset = 0) {
  return db.prepare(`
    SELECT *
    FROM economy_tax_history
    WHERE guild_id = ?
    ORDER BY timestamp DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(String(guildId), Number(limit), Number(offset));
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

      recordTax(
        guildId,
        row.user_id,
        `${normalizedScope}_leaderboard_payout`,
        gross,
        tax,
        net,
        tax,
        `${normalizedScope} leaderboard tax`,
        createdAt
      );

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
  BUILTIN_JOBS,
  BASE_PASSIVE_REWARD,
  PASSIVE_COOLDOWN_MS,
  addCrowns,
  removeCrowns,
  getBalance,
  getUserStats,
  getUserJobState,
  getLeaderboard,
  getRank,
  getEconomySummary,
  rewardPassiveMessage,
  getPassiveMultiplier,
  setBoost,
  getBoostStatus,
  maybePayoutLeaderboard,
  formatCurrency,
  currencyName,
  currencyEmoji,
  getServerBank,
  addServerBank,
  removeServerBank,
  recordTax,
  getTaxHistory,
  getBuiltinJob,
  getJobConfig,
  listJobs,
  setupJob,
  disableJob,
  resetJob,
  startJob,
  quitJob,
  workShift,
  getSalaryInfo,
  normalizeJobId,
  formatDuration,
};