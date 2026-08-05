const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'msgtracker.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

function ensureSchema() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,

      total INTEGER NOT NULL DEFAULT 0,
      daily INTEGER NOT NULL DEFAULT 0,
      weekly INTEGER NOT NULL DEFAULT 0,
      monthly INTEGER NOT NULL DEFAULT 0,

      first_seen_at INTEGER NOT NULL DEFAULT 0,
      last_message_at INTEGER NOT NULL DEFAULT 0,
      last_message_id TEXT,

      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,

      peak_daily INTEGER NOT NULL DEFAULT 0,
      peak_weekly INTEGER NOT NULL DEFAULT 0,
      peak_monthly INTEGER NOT NULL DEFAULT 0,

      last_active_date TEXT,

      PRIMARY KEY (guild_id, user_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_tracker_meta (
      guild_id TEXT PRIMARY KEY,
      daily_key TEXT NOT NULL,
      weekly_key TEXT NOT NULL,
      monthly_key TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_tracker_cursors (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      last_message_id TEXT NOT NULL,
      last_message_at INTEGER NOT NULL
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

function getTzParts(ts = Date.now()) {
  const d = new Date(ts + TZ_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(), // 0 = Sunday
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function getDateKey(ts = Date.now()) {
  const p = getTzParts(ts);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function getMonthKey(ts = Date.now()) {
  const p = getTzParts(ts);
  return `${p.year}-${pad(p.month)}`;
}

// Monday-based week key in the fixed timezone
function getWeekKey(ts = Date.now()) {
  const p = getTzParts(ts);
  const mondayOffset = (p.weekday + 6) % 7;
  const mondayUtc = Date.UTC(p.year, p.month - 1, p.day - mondayOffset);
  const monday = new Date(mondayUtc);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

function buildKeys(ts = Date.now()) {
  return {
    daily: getDateKey(ts),
    weekly: getWeekKey(ts),
    monthly: getMonthKey(ts),
  };
}

function isTrackableMessage(client, message) {
  if (!message || !message.guild) return false;
  if (!message.author || message.author.bot) return false;
  if (message.webhookId) return false;
  if (message.commandName) return false; // ignore live commands
  if (client?.botBlacklist?.has?.(message.author.id)) return false;

  const prefix = client?.getPrefix?.(message.guild.id);
  if (prefix && typeof message.content === 'string' && message.content.trim().startsWith(prefix)) {
    return false;
  }

  return true;
}

function ensureMetaRow(guildId, keys) {
  const row = db.prepare(`
    SELECT daily_key, weekly_key, monthly_key
    FROM message_tracker_meta
    WHERE guild_id = ?
  `).get(guildId);

  if (!row) {
    db.prepare(`
      INSERT INTO message_tracker_meta (guild_id, daily_key, weekly_key, monthly_key)
      VALUES (?, ?, ?, ?)
    `).run(guildId, keys.daily, keys.weekly, keys.monthly);

    return { daily_key: keys.daily, weekly_key: keys.weekly, monthly_key: keys.monthly };
  }

  return row;
}

function payoutScope(client, guildId, scope, periodKey) {
  if (!client?.economy?.maybePayoutLeaderboard) return;

  try {
    const payouts = client.economy.maybePayoutLeaderboard(client, guildId, scope, periodKey);
    if (payouts?.length) {
      console.log(
        `[MessageTracker] Paid ${scope} leaderboard for guild ${guildId}: ` +
        payouts.map(p => `#${p.placement} ${p.net}`).join(', ')
      );
    }
  } catch (err) {
    console.error(`[MessageTracker] ${scope} payout failed for guild ${guildId}:`, err);
  }
}

function syncGuildPeriods(client, guildId, keys) {
  const row = ensureMetaRow(guildId, keys);

  const dailyChanged = row.daily_key !== keys.daily;
  const weeklyChanged = row.weekly_key !== keys.weekly;
  const monthlyChanged = row.monthly_key !== keys.monthly;

  if (!dailyChanged && !weeklyChanged && !monthlyChanged) {
    return;
  }

  const tx = db.transaction(() => {
    if (weeklyChanged) {
      payoutScope(client, guildId, 'weekly', row.weekly_key);
    }

    if (monthlyChanged) {
      payoutScope(client, guildId, 'monthly', row.monthly_key);
    }

    if (dailyChanged) {
      db.prepare(`
        UPDATE message_stats
        SET daily = 0
        WHERE guild_id = ?
      `).run(guildId);
    }

    if (weeklyChanged) {
      db.prepare(`
        UPDATE message_stats
        SET weekly = 0
        WHERE guild_id = ?
      `).run(guildId);
    }

    if (monthlyChanged) {
      db.prepare(`
        UPDATE message_stats
        SET monthly = 0
        WHERE guild_id = ?
      `).run(guildId);
    }

    db.prepare(`
      UPDATE message_tracker_meta
      SET daily_key = ?, weekly_key = ?, monthly_key = ?
      WHERE guild_id = ?
    `).run(keys.daily, keys.weekly, keys.monthly, guildId);
  });

  tx();
}

const insertUserRow = db.prepare(`
  INSERT INTO message_stats (
    guild_id, user_id,
    total, daily, weekly, monthly,
    first_seen_at, last_message_at, last_message_id,
    current_streak, longest_streak,
    peak_daily, peak_weekly, peak_monthly,
    last_active_date
  )
  VALUES (?, ?, 0, 0, 0, 0, ?, 0, NULL, 0, 0, 0, 0, 0, NULL)
  ON CONFLICT(guild_id, user_id) DO NOTHING
`);

const getUserRow = db.prepare(`
  SELECT *
  FROM message_stats
  WHERE guild_id = ? AND user_id = ?
`);

const updateUserRow = db.prepare(`
  UPDATE message_stats
  SET
    total = total + 1,
    daily = daily + 1,
    weekly = weekly + 1,
    monthly = monthly + 1,
    last_message_at = ?,
    last_message_id = ?,
    current_streak = ?,
    longest_streak = ?,
    peak_daily = ?,
    peak_weekly = ?,
    peak_monthly = ?,
    last_active_date = ?
  WHERE guild_id = ? AND user_id = ?
`);

const upsertCursor = db.prepare(`
  INSERT INTO message_tracker_cursors (
    channel_id, guild_id, last_message_id, last_message_at
  )
  VALUES (?, ?, ?, ?)
  ON CONFLICT(channel_id) DO UPDATE SET
    guild_id = excluded.guild_id,
    last_message_id = excluded.last_message_id,
    last_message_at = excluded.last_message_at
`);

function trackMessage(client, message, opts = {}) {
  if (!isTrackableMessage(client, message)) return false;

  const ts = opts.timestamp ?? message.createdTimestamp ?? Date.now();
  const guildId = message.guild.id;
  const userId = message.author.id;
  const keys = buildKeys(ts);

  syncGuildPeriods(client, guildId, keys);
  insertUserRow.run(guildId, userId, ts);

  const row = getUserRow.get(guildId, userId);
  if (!row) return false;

  const currentDateKey = keys.daily;
  const prevDateKey = getDateKey(ts - DAY_MS);

  let nextStreak = row.current_streak || 0;

  if (row.last_active_date === currentDateKey) {
    nextStreak = row.current_streak || 1;
  } else if (row.last_active_date === prevDateKey && row.last_active_date) {
    nextStreak = (row.current_streak || 0) + 1;
  } else {
    nextStreak = 1;
  }

  const nextDaily = (row.daily || 0) + 1;
  const nextWeekly = (row.weekly || 0) + 1;
  const nextMonthly = (row.monthly || 0) + 1;

  const nextLongest = Math.max(row.longest_streak || 0, nextStreak);
  const nextPeakDaily = Math.max(row.peak_daily || 0, nextDaily);
  const nextPeakWeekly = Math.max(row.peak_weekly || 0, nextWeekly);
  const nextPeakMonthly = Math.max(row.peak_monthly || 0, nextMonthly);

  updateUserRow.run(
    ts,
    message.id,
    nextStreak,
    nextLongest,
    nextPeakDaily,
    nextPeakWeekly,
    nextPeakMonthly,
    currentDateKey,
    guildId,
    userId
  );

  if (message.channel?.id) {
    upsertCursor.run(message.channel.id, guildId, message.id, ts);
  }

  if (client?.economy?.rewardPassiveMessage) {
    try {
      client.economy.rewardPassiveMessage(client, message, ts);
    } catch (err) {
      console.error('[MessageTracker] Passive reward failed:', err);
    }
  }

  return true;
}

async function backfillChannel(client, channelId, lastMessageId, cutoffTs) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return;

  let after = lastMessageId;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, after }).catch(() => null);
    if (!batch || !batch.size) break;

    const messages = [...batch.values()].sort((a, b) => {
      const ai = BigInt(a.id);
      const bi = BigInt(b.id);
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });

    const eligible = messages.filter(m => {
      if (!m.guild || !m.author || m.author.bot || m.webhookId) return false;
      return (m.createdTimestamp || 0) < cutoffTs;
    });

    if (!eligible.length) break;

    for (const msg of eligible) {
      trackMessage(client, msg, { timestamp: msg.createdTimestamp });
    }

    const lastEligible = eligible[eligible.length - 1];
    after = lastEligible.id;

    if (messages.length < 100) break;

    const lastMessage = messages[messages.length - 1];
    if ((lastMessage.createdTimestamp || 0) >= cutoffTs) {
      break;
    }
  }
}

async function backfillAll(client, cutoffTs = Date.now()) {
  const rows = db.prepare(`
    SELECT channel_id, last_message_id
    FROM message_tracker_cursors
  `).all();

  for (const row of rows) {
    await backfillChannel(client, row.channel_id, row.last_message_id, cutoffTs);
  }
}

function getUserStats(guildId, userId) {
  const row = getUserRow.get(String(guildId), String(userId));
  return row || {
    guild_id: String(guildId),
    user_id: String(userId),
    total: 0,
    daily: 0,
    weekly: 0,
    monthly: 0,
    first_seen_at: 0,
    last_message_at: 0,
    last_message_id: null,
    current_streak: 0,
    longest_streak: 0,
    peak_daily: 0,
    peak_weekly: 0,
    peak_monthly: 0,
    last_active_date: null,
  };
}

function getGuildStats(guildId) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS tracked_users,
      COALESCE(SUM(total), 0) AS total,
      COALESCE(SUM(daily), 0) AS daily,
      COALESCE(SUM(weekly), 0) AS weekly,
      COALESCE(SUM(monthly), 0) AS monthly
    FROM message_stats
    WHERE guild_id = ?
  `).get(String(guildId));

  return row || {
    tracked_users: 0,
    total: 0,
    daily: 0,
    weekly: 0,
    monthly: 0,
  };
}

function getRank(guildId, userId, scope = 'total') {
  const col = ['total', 'daily', 'weekly', 'monthly'].includes(scope) ? scope : 'total';
  const row = getUserStats(guildId, userId);
  const value = Number(row[col] || 0);

  if (value <= 0) return null;

  const result = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM message_stats
    WHERE guild_id = ? AND ${col} > ?
  `).get(String(guildId), value);

  return result?.rank || null;
}

function getLeaderboard(guildId, scope = 'total', limit = 10, offset = 0) {
  const col = ['total', 'daily', 'weekly', 'monthly'].includes(scope) ? scope : 'total';

  return db.prepare(`
    SELECT user_id, total, daily, weekly, monthly, first_seen_at, last_message_at
    FROM message_stats
    WHERE guild_id = ?
    ORDER BY ${col} DESC, total DESC, last_message_at DESC, user_id ASC
    LIMIT ? OFFSET ?
  `).all(String(guildId), Number(limit), Number(offset));
}

function resetGuild(guildId, scope = 'all') {
  const keys = buildKeys(Date.now());

  const tx = db.transaction(() => {
    if (scope === 'all') {
      db.prepare(`
        UPDATE message_stats
        SET total = 0,
            daily = 0,
            weekly = 0,
            monthly = 0,
            current_streak = 0,
            longest_streak = 0,
            peak_daily = 0,
            peak_weekly = 0,
            peak_monthly = 0,
            last_active_date = NULL
        WHERE guild_id = ?
      `).run(String(guildId));

      db.prepare(`
        UPDATE message_tracker_meta
        SET daily_key = ?, weekly_key = ?, monthly_key = ?
        WHERE guild_id = ?
      `).run(keys.daily, keys.weekly, keys.monthly, String(guildId));

      return;
    }

    if (scope === 'daily') {
      db.prepare(`UPDATE message_stats SET daily = 0 WHERE guild_id = ?`).run(String(guildId));
      db.prepare(`
        UPDATE message_tracker_meta
        SET daily_key = ?
        WHERE guild_id = ?
      `).run(keys.daily, String(guildId));
      return;
    }

    if (scope === 'weekly') {
      db.prepare(`UPDATE message_stats SET weekly = 0 WHERE guild_id = ?`).run(String(guildId));
      db.prepare(`
        UPDATE message_tracker_meta
        SET weekly_key = ?
        WHERE guild_id = ?
      `).run(keys.weekly, String(guildId));
      return;
    }

    if (scope === 'monthly') {
      db.prepare(`UPDATE message_stats SET monthly = 0 WHERE guild_id = ?`).run(String(guildId));
      db.prepare(`
        UPDATE message_tracker_meta
        SET monthly_key = ?
        WHERE guild_id = ?
      `).run(keys.monthly, String(guildId));
    }
  });

  tx();
}

function resetUser(guildId, userId) {
  db.prepare(`
    UPDATE message_stats
    SET total = 0,
        daily = 0,
        weekly = 0,
        monthly = 0,
        current_streak = 0,
        longest_streak = 0,
        peak_daily = 0,
        peak_weekly = 0,
        peak_monthly = 0,
        last_active_date = NULL
    WHERE guild_id = ? AND user_id = ?
  `).run(String(guildId), String(userId));
}

async function tick(client) {
  if (client._msgTrackerBackfilling) return;

  const keys = buildKeys(Date.now());
  for (const guild of client.guilds.cache.values()) {
    try {
      syncGuildPeriods(client, guild.id, keys);
    } catch (err) {
      console.error(`[MessageTracker] Tick failed for ${guild.id}:`, err);
    }
  }
}

async function init(client) {
  if (client._msgTrackerReady) return module.exports;
  client._msgTrackerReady = true;
  client.msgTrackerDB = db;
  client.messageTracker = module.exports;

  if (!client._msgTrackerTickInterval) {
    client._msgTrackerTickInterval = setInterval(() => {
      tick(client).catch(err => {
        console.error('[MessageTracker] Tick failed:', err);
      });
    }, 60_000);

    client._msgTrackerTickInterval.unref?.();
  }

  const cutoff = Date.now();
  client._msgTrackerBackfillCutoff = cutoff;
  client._msgTrackerBackfilling = true;

  setImmediate(async () => {
    try {
      await backfillAll(client, cutoff);
    } catch (err) {
      console.error('[MessageTracker] Backfill failed:', err);
    } finally {
      client._msgTrackerBackfilling = false;
      tick(client).catch(err => {
        console.error('[MessageTracker] Post-backfill tick failed:', err);
      });
    }
  });

  return module.exports;
}

module.exports = {
  init,
  handleMessage: trackMessage,
  backfillAll,
  getUserStats,
  getGuildStats,
  getLeaderboard,
  getRank,
  resetGuild,
  resetUser,
  isTrackableMessage,
  buildKeys,
  getDateKey,
  tick,
};