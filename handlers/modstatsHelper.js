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
        // Check both possible database references
        const db = client.modstatsDB || client.automodDB;
        if (!db) {
            console.error('[ModStats] Database not available');
            return false;
        }

        const timestamp = Date.now();
        const stmt = db.prepare(
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
        // Check both possible database references
        const db = client.modstatsDB || client.automodDB;
        if (!db) {
            console.error('[ModStats] No database available in getModStats');
            return null;
        }

        const stats = db.prepare(`
            SELECT 
                action_type,
                COUNT(*) as count
            FROM modstats 
            WHERE guild_id = ? AND moderator_id = ?
            GROUP BY action_type
        `).all(guildId, moderatorId);

        // Convert to object - ONLY TRACK WHAT WE WANT
        const result = {
            warns: 0,
            warnremoves: 0,
            bans: 0,
            unbans: 0,
            mutes: 0,
            // REMOVED: unmutes: 0,
            kicks: 0,
            total: 0
        };

        for (const row of stats) {
            const type = row.action_type.toLowerCase();
            // Only count types we want to track
            if (result.hasOwnProperty(type)) {
                result[type] = row.count;
                result.total += row.count;
            }
            // Ignore "unmute" and other unwanted types
        }

        return result;
    } catch (error) {
        console.error('[ModStats] Failed to get stats:', error);
        return null;
    }
}

/**
 * Get moderation leaderboard for a guild with pagination
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {number} limit - Number of top moderators to return
 * @param {number} offset - Offset for pagination
 * @returns {Array} Array of moderator stats
 */
function getModLeaderboard(client, guildId, limit = 10, offset = 0) {
    try {
        // Check both possible database references
        const db = client.modstatsDB || client.automodDB;
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
                -- REMOVED: SUM(CASE WHEN action_type = 'unmute' THEN 1 ELSE 0 END) as unmutes,
                SUM(CASE WHEN action_type = 'kick' THEN 1 ELSE 0 END) as kicks
            FROM modstats 
            WHERE guild_id = ?
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
 * Get total number of moderators with actions
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @returns {number} Total moderators count
 */
function getTotalModerators(client, guildId) {
    try {
        // Check both possible database references
        const db = client.modstatsDB || client.automodDB;
        if (!db) {
            console.error('[ModStats] No database available in getTotalModerators');
            return 0;
        }

        const result = db.prepare(`
            SELECT COUNT(DISTINCT moderator_id) as count 
            FROM modstats 
            WHERE guild_id = ?
        `).get(guildId);

        return result ? result.count : 0;
    } catch (error) {
        console.error('[ModStats] Failed to get total moderators:', error);
        return 0;
    }
}

/**
 * Get all actions for a specific target user
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @param {string} targetId - Target user ID
 * @param {number} limit - Max actions to return
 * @returns {Array} Array of actions
 */
function getTargetActions(client, guildId, targetId, limit = 20) {
    try {
        // Check both possible database references
        const db = client.modstatsDB || client.automodDB;
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