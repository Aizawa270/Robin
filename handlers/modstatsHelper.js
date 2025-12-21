const { EmbedBuilder } = require('discord.js');

/**
 * Log a moderation action to modstats database
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} moderatorId - Moderator user ID
 * @param {string} targetId - Target user ID
 * @param {string} actionType - Type of action (warn, warnremove, ban, unban, mute, unmute, kick)
 * @param {string} reason - Reason for action
 * @param {string} duration - Duration (for mute, etc.)
 * @returns {boolean} Success status
 */
function logModAction(client, guildId, moderatorId, targetId, actionType, reason, duration = null) {
    try {
        if (!client.modstatsDB) {
            console.error('[ModStats] Database not available');
            return false;
        }

        const timestamp = Date.now();
        const stmt = client.modstatsDB.prepare(
            'INSERT INTO modstats (guild_id, moderator_id, target_id, action_type, reason, duration, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        
        stmt.run(guildId, moderatorId, targetId, actionType, reason || 'No reason provided', duration, timestamp);
        
        console.log(`[ModStats] Logged ${actionType} by ${moderatorId} on ${targetId}`);
        return true;
    } catch (error) {
        console.error('[ModStats] Failed to log action:', error);
        return false;
    }
}

/**
 * Get moderator statistics for a specific guild
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} moderatorId - Moderator user ID
 * @returns {Object} Stats object with action counts
 */
function getModStats(client, guildId, moderatorId) {
    try {
        const stats = client.modstatsDB.prepare(`
            SELECT 
                action_type,
                COUNT(*) as count
            FROM modstats 
            WHERE guild_id = ? AND moderator_id = ?
            GROUP BY action_type
        `).all(guildId, moderatorId);

        // Convert to object
        const result = {
            warns: 0,
            warnremoves: 0,
            bans: 0,
            unbans: 0,
            mutes: 0,
            unmutes: 0,
            kicks: 0,
            total: 0
        };

        for (const row of stats) {
            const type = row.action_type.toLowerCase();
            if (result.hasOwnProperty(type)) {
                result[type] = row.count;
                result.total += row.count;
            }
        }

        return result;
    } catch (error) {
        console.error('[ModStats] Failed to get stats:', error);
        return null;
    }
}

/**
 * Get moderation leaderboard for a guild
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {number} limit - Number of top moderators to return
 * @returns {Array} Array of moderator stats
 */
function getModLeaderboard(client, guildId, limit = 10) {
    try {
        const leaderboard = client.modstatsDB.prepare(`
            SELECT 
                moderator_id,
                COUNT(*) as total_actions,
                SUM(CASE WHEN action_type = 'warn' THEN 1 ELSE 0 END) as warns,
                SUM(CASE WHEN action_type = 'warnremove' THEN 1 ELSE 0 END) as warnremoves,
                SUM(CASE WHEN action_type = 'ban' THEN 1 ELSE 0 END) as bans,
                SUM(CASE WHEN action_type = 'unban' THEN 1 ELSE 0 END) as unbans,
                SUM(CASE WHEN action_type = 'mute' THEN 1 ELSE 0 END) as mutes,
                SUM(CASE WHEN action_type = 'unmute' THEN 1 ELSE 0 END) as unmutes,
                SUM(CASE WHEN action_type = 'kick' THEN 1 ELSE 0 END) as kicks
            FROM modstats 
            WHERE guild_id = ?
            GROUP BY moderator_id
            ORDER BY total_actions DESC
            LIMIT ?
        `).all(guildId, limit);

        return leaderboard;
    } catch (error) {
        console.error('[ModStats] Failed to get leaderboard:', error);
        return [];
    }
}

/**
 * Format duration for display
 * @param {string} durationStr - Duration string (1h, 30m, etc.)
 * @returns {string} Formatted duration
 */
function formatDuration(durationStr) {
    if (!durationStr) return 'Permanent';
    
    const match = durationStr.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return durationStr;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const units = {
        s: 'seconds',
        m: 'minutes',
        h: 'hours',
        d: 'days'
    };
    
    return `${value} ${units[unit] || unit}`;
}

module.exports = {
    logModAction,
    getModStats,
    getModLeaderboard,
    formatDuration
};