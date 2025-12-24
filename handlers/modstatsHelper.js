// handlers/modstatsHelper.js
const SYSTEM_EXCLUDE_IDS = ['AUTOMOD-SYSTEM', 'AUTO-BAN-SYSTEM'];

function getDb(client) {
  return client.modstatsDB || client.automodDB || null;
}

function logModAction(client, guildId, moderatorId, targetId, actionType, reason, duration = null) {
  try {
    if (!client) throw new Error('Client missing');
    if (!guildId || !moderatorId || !targetId || !actionType) {
      console.warn('[ModStats] missing parameters for logModAction');
    }
    if (String(actionType).toLowerCase() === 'unmute') {
      // If you purposely skip unmute logs, keep it skipped
      return false;
    }
    const db = getDb(client);
    if (!db) {
      console.error('[ModStats] No DB available for logging');
      return false;
    }

    const timestamp = Date.now();
    const stmt = db.prepare(
      'INSERT INTO modstats (guild_id, moderator_id, target_id, action_type, reason, duration, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(guildId, moderatorId, targetId, actionType, reason || 'No reason provided', duration, timestamp);
    // console.log for debugging
    // console.log(`[ModStats] Logged ${actionType} by ${moderatorId} on ${targetId}`);
    return true;
  } catch (error) {
    console.error('[ModStats] Failed to log action:', error);
    return false;
  }
}

function getModStats(client, guildId, moderatorId) {
  try {
    const db = getDb(client);
    if (!db) return null;

    // exclude system IDs
    const placeholders = SYSTEM_EXCLUDE_IDS.map(() => '?').join(',');
    const params = [guildId, moderatorId, ...SYSTEM_EXCLUDE_IDS];

    const stats = db.prepare(`
      SELECT action_type, COUNT(*) as count
      FROM modstats
      WHERE guild_id = ? AND moderator_id = ? AND action_type != 'unmute' AND (moderator_id NOT IN (${placeholders}) OR moderator_id IS NULL)
      GROUP BY action_type
    `).all(...params);

    const result = { warns: 0, warnremoves: 0, bans: 0, unbans: 0, mutes: 0, kicks: 0, total: 0 };

    for (const row of stats) {
      const type = String(row.action_type).toLowerCase();
      if (type === 'warn') { result.warns = row.count; result.total += row.count; }
      else if (type === 'warnremove') { result.warnremoves = row.count; result.total += row.count; }
      else if (type === 'ban') { result.bans = row.count; result.total += row.count; }
      else if (type === 'unban') { result.unbans = row.count; result.total += row.count; }
      else if (type === 'mute') { result.mutes = row.count; result.total += row.count; }
      else if (type === 'kick') { result.kicks = row.count; result.total += row.count; }
    }

    return result;
  } catch (error) {
    console.error('[ModStats] getModStats failed:', error);
    return null;
  }
}

function getModLeaderboard(client, guildId, limit = 10, offset = 0) {
  try {
    const db = getDb(client);
    if (!db) return [];

    // Exclude system moderators
    const placeholders = SYSTEM_EXCLUDE_IDS.map(() => '?').join(',');
    const params = [guildId, ...SYSTEM_EXCLUDE_IDS, limit, offset];

    const leaderboard = db.prepare(`
      SELECT moderator_id,
             COUNT(*) as total_actions,
             SUM(CASE WHEN action_type = 'warn' THEN 1 ELSE 0 END) as warns,
             SUM(CASE WHEN action_type = 'warnremove' THEN 1 ELSE 0 END) as warnremoves,
             SUM(CASE WHEN action_type = 'ban' THEN 1 ELSE 0 END) as bans,
             SUM(CASE WHEN action_type = 'unban' THEN 1 ELSE 0 END) as unbans,
             SUM(CASE WHEN action_type = 'mute' THEN 1 ELSE 0 END) as mutes,
             SUM(CASE WHEN action_type = 'kick' THEN 1 ELSE 0 END) as kicks
      FROM modstats
      WHERE guild_id = ? AND (moderator_id NOT IN (${placeholders}) OR moderator_id IS NULL) AND action_type != 'unmute'
      GROUP BY moderator_id
      ORDER BY total_actions DESC
      LIMIT ? OFFSET ?
    `).all(...params);

    return leaderboard;
  } catch (error) {
    console.error('[ModStats] getModLeaderboard failed:', error);
    return [];
  }
}

function getTotalModerators(client, guildId) {
  try {
    const db = getDb(client);
    if (!db) return 0;

    const placeholders = SYSTEM_EXCLUDE_IDS.map(() => '?').join(',');
    const params = [guildId, ...SYSTEM_EXCLUDE_IDS];

    const result = db.prepare(`
      SELECT COUNT(DISTINCT moderator_id) as count 
      FROM modstats 
      WHERE guild_id = ? AND action_type != 'unmute' AND (moderator_id NOT IN (${placeholders}) OR moderator_id IS NULL)
    `).get(...params);

    return result ? result.count : 0;
  } catch (error) {
    console.error('[ModStats] getTotalModerators failed:', error);
    return 0;
  }
}

function getTargetActions(client, guildId, targetId, limit = 20) {
  try {
    const db = getDb(client);
    if (!db) return [];

    const actions = db.prepare(`
      SELECT action_type, moderator_id, reason, duration, timestamp
      FROM modstats
      WHERE guild_id = ? AND target_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(guildId, targetId, limit);

    return actions;
  } catch (error) {
    console.error('[ModStats] getTargetActions failed:', error);
    return [];
  }
}

module.exports = {
  logModAction,
  getModStats,
  getModLeaderboard,
  getTotalModerators,
  getTargetActions
};