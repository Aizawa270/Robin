const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ⚠️ IMPORTANT: Remove this if it exists in your project - we don't need JSON file anymore
// const WARN_FILE = path.join(__dirname, '../../warns.json');

// Load existing warns from SQLite
function getWarnCountFromDB(client, guildId, userId) {
  try {
    if (!client.automodDB) {
      console.error('[Warn] No database available');
      return 0;
    }
    
    const row = client.automodDB.prepare(`
      SELECT count FROM automod_warn_counts 
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    return row ? row.count : 0;
  } catch (error) {
    console.error('[Warn] Error getting warn count:', error);
    return 0;
  }
}

// Add warn to SQLite database
function addWarnToDB(client, guildId, userId, moderatorId, reason) {
  try {
    if (!client.automodDB) {
      console.error('[Warn] No database available for adding warn');
      return false;
    }

    // Insert warn
    client.automodDB.prepare(`
      INSERT INTO automod_warns (guild_id, user_id, moderator_id, reason, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, moderatorId, reason || 'No reason provided', Date.now());

    // Update count
    client.automodDB.prepare(`
      INSERT OR REPLACE INTO automod_warn_counts (guild_id, user_id, count)
      VALUES (?, ?, COALESCE((SELECT count FROM automod_warn_counts WHERE guild_id = ? AND user_id = ?), 0) + 1)
    `).run(guildId, userId, guildId, userId);

    console.log(`[Warn] Added warn to database: ${moderatorId} -> ${userId} in ${guildId}`);
    return true;
  } catch (error) {
    console.error('[Warn] Error adding warn to DB:', error);
    return false;
  }
}

// Clear warns from SQLite (for auto-ban)
function clearWarnsFromDB(client, guildId, userId) {
  try {
    if (!client.automodDB) return false;
    
    // Delete warns
    client.automodDB.prepare(`
      DELETE FROM automod_warns 
      WHERE guild_id = ? AND user_id = ?
    `).run(guildId, userId);

    // Delete count
    client.automodDB.prepare(`
      DELETE FROM automod_warn_counts 
      WHERE guild_id = ? AND user_id = ?
    `).run(guildId, userId);

    return true;
  } catch (error) {
    console.error('[Warn] Error clearing warns from DB:', error);
    return false;
  }
}

module.exports = {
  name: 'warn',
  description: 'Warn a user. Auto-bans at 5 warns.',
  category: 'mod',
  usage: '$warn <@user|userID> <reason>',
  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('You need Moderate Members permission.');
    }

    const targetArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    if (!targetArg) return message.reply('Provide a user.');

    const targetUser = message.mentions.users.first() ||
                     (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not in server.');

    if (member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('Admins are immune.');

    const guildId = message.guild.id;

    // 1. ADD TO SQLITE DATABASE
    console.log(`[Warn] Attempting to warn ${targetUser.id} by ${message.author.id}`);
    const dbSuccess = addWarnToDB(client, guildId, targetUser.id, message.author.id, reason);

    if (!dbSuccess) {
      return message.reply('Failed to add warning to database.');
    }

    // Get total warn count
    const warnCount = getWarnCountFromDB(client, guildId, targetUser.id);
    console.log(`[Warn] User ${targetUser.id} now has ${warnCount} warnings`);

    // 2. LOG TO MODSTATS - CRITICAL FIX
    try {
      // Import dynamically to avoid circular dependencies
      const { logModAction } = require('../../handlers/modstatsHelper');
      const logSuccess = logModAction(
        client,
        guildId,
        message.author.id,
        targetUser.id,
        'warn',
        reason
      );
      
      if (!logSuccess) {
        console.error('[Warn] Failed to log to modstats');
      } else {
        console.log(`[Warn] Successfully logged to modstats: ${message.author.id} warned ${targetUser.id}`);
      }
    } catch (logError) {
      console.error('[Warn] Error calling logModAction:', logError);
    }

    // AUTO BAN at 5 warns
    if (warnCount >= 5) {
      try {
        console.log(`[Warn] Auto-banning ${targetUser.id} for 5 warnings`);
        await member.ban({ reason: `Reached 5 warns | ${reason}` });

        // Clear warns
        clearWarnsFromDB(client, guildId, targetUser.id);

        // Log ban to modstats
        try {
          const { logModAction } = require('../../handlers/modstatsHelper');
          logModAction(client, guildId, 'AUTO-BAN-SYSTEM', targetUser.id, 'ban', `Auto-ban for reaching 5 warnings: ${reason}`);
        } catch {}

        const banEmbed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('User Auto-Banned')
          .addFields(
            { name: 'User', value: `<@${targetUser.id}>`, inline: false },
            { name: 'Reason', value: `Reached 5 warnings (Automatic)`, inline: false },
            { name: 'Warning Count', value: `5/5`, inline: false }
          )
          .setTimestamp();

        return message.reply({ embeds: [banEmbed] });
      } catch (banError) {
        console.error('[Warn] Auto-ban error:', banError);
        return message.reply('User reached 5 warnings but failed to auto-ban.');
      }
    }

    // Send warning confirmation
    const embed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle('User Warned')
      .addFields(
        { name: 'User', value: `<@${targetUser.id}>`, inline: false },
        { name: 'Moderator', value: `<@${message.author.id}>`, inline: false },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Total Warns', value: `${warnCount}/5`, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};