const { EmbedBuilder } = require('discord.js');

/**
 * Log a moderation action to modstats database - FIXED VERSION
 */
function logModAction(client, guildId, moderatorId, targetId, actionType, reason, duration = null) {
  try {
    console.log(`[ModStats] Attempting to log ${actionType} by ${moderatorId} on ${targetId}`);
    
    // SKIP UNMUTES ENTIRELY
    if (actionType.toLowerCase() === 'unmute') {
      console.log(`[ModStats] Skipping unmute log as requested`);
      return false;
    }
    
    // Get database
    const db = client.automodDB;
    if (!db) {
      console.error('[ModStats] No database available!');
      return false;
    }

    const timestamp = Date.now();
    const stmt = db.prepare(
      'INSERT INTO modstats (guild_id, moderator_id, target_id, action_type, reason, duration, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    stmt.run(guildId, moderatorId, targetId, actionType, reason || 'No reason provided', duration, timestamp);

    console.log(`[ModStats] Successfully logged ${actionType}`);
    return true;
  } catch (error) {
    console.error('[ModStats] Failed to log action:', error);
    console.error('[ModStats] Error stack:', error.stack);
    return false;
  }
}

/**
 * Get moderator statistics - FIXED: Excludes unmutes
 */
function getModStats(client, guildId, moderatorId) {
  try {
    const db = client.automodDB;
    if (!db) {
      console.error('[ModStats] No database available in getModStats');
      return null;
    }

    const stats = db.prepare(`
      SELECT 
        action_type,
        COUNT(*) as count
      FROM modstats 
      WHERE guild_id = ? AND moderator_id = ? AND action_type != 'unmute'
      GROUP BY action_type
    `).all(guildId, moderatorId);

    // Convert to object - NO UNMUTES FIELD
    const result = {
      warns: 0,
      warnremoves: 0,
      bans: 0,
      unbans: 0,
      mutes: 0,
      kicks: 0,
      total: 0
    };

    for (const row of stats) {
      const type = row.action_type.toLowerCase();
      if (type === 'warn') {
        result.warns = row.count;
        result.total += row.count;
      } else if (type === 'warnremove') {
        result.warnremoves = row.count;
        result.total += row.count;
      } else if (type === 'ban') {
        result.bans = row.count;
        result.total += row.count;
      } else if (type === 'unban') {
        result.unbans = row.count;
        result.total += row.count;
      } else if (type === 'mute') {
        result.mutes = row.count;
        result.total += row.count;
      } else if (type === 'kick') {
        result.kicks = row.count;
        result.total += row.count;
      }
    }

    console.log(`[ModStats] Retrieved stats for ${moderatorId}:`, result);
    return result;
  } catch (error) {
    console.error('[ModStats] Failed to get stats:', error);
    return null;
  }
}

/**
 * Get moderation leaderboard - FIXED: Excludes unmutes
 */
function getModLeaderboard(client, guildId, limit = 10, offset = 0) {
  try {
    const db = client.automodDB;
    if (!db) {
      console.error('[ModStats] No database available in getModLeaderboard');
      return [];
    }

    const leaderboard = db.prepare(`
      SELECT 
        moderator_id,
        COUNT(*) as total_actions,
        SUM(CASE WHEN action_type = 'warn' THEN 1 ELSE 0 END) as warns,
        SUM(CASE WHEN action_type = 'warnremove' THEN 1 ELSE 0 END) as warnremoves,
        SUM(CASE WHEN action_type = 'ban' THEN 1 ELSE 0 END) as bans,
        SUM(CASE WHEN action_type = 'unban' THEN 1 ELSE 0 END) as unbans,
        SUM(CASE WHEN action_type = 'mute' THEN 1 ELSE 0 END) as mutes,
        SUM(CASE WHEN action_type = 'kick' THEN 1 ELSE 0 END) as kicks
      FROM modstats 
      WHERE guild_id = ? AND action_type != 'unmute'
      GROUP BY moderator_id
      ORDER BY total_actions DESC
      LIMIT ? OFFSET ?
    `).all(guildId, limit, offset);

    return leaderboard;
  } catch (error) {
    console.error('[ModStats] Failed to get leaderboard:', error);
    return [];
  }
}

/**
 * Get total number of moderators - FIXED: Excludes unmutes
 */
function getTotalModerators(client, guildId) {
  try {
    const db = client.automodDB;
    if (!db) {
      console.error('[ModStats] No database available in getTotalModerators');
      return 0;
    }

    const result = db.prepare(`
      SELECT COUNT(DISTINCT moderator_id) as count 
      FROM modstats 
      WHERE guild_id = ? AND action_type != 'unmute'
    `).get(guildId);

    return result ? result.count : 0;
  } catch (error) {
    console.error('[ModStats] Failed to get total moderators:', error);
    return 0;
  }
}

/**
 * Get all actions for a specific target user
 */
function getTargetActions(client, guildId, targetId, limit = 20) {
  try {
    const db = client.automodDB;
    if (!db) {
      console.error('[ModStats] No database available in getTargetActions');
      return [];
    }

    const actions = db.prepare(`
      SELECT action_type, moderator_id, reason, duration, timestamp
      FROM modstats
      WHERE guild_id = ? AND target_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(guildId, targetId, limit);

    return actions;
  } catch (error) {
    console.error('[ModStats] Failed to get target actions:', error);
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