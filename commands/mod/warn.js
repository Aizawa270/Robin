const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { logModAction } = require('../../handlers/modstatsHelper');

// Warns are stored in automod database, not JSON
function getWarnsFromDB(client, guildId, userId) {
  try {
    return client.automodDB.prepare(`
      SELECT * FROM automod_warns 
      WHERE guild_id = ? AND user_id = ?
      ORDER BY timestamp DESC
    `).all(guildId, userId);
  } catch (error) {
    console.error('Error getting warns from DB:', error);
    return [];
  }
}

function addWarnToDB(client, guildId, userId, moderatorId, reason) {
  try {
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

    return true;
  } catch (error) {
    console.error('Error adding warn to DB:', error);
    return false;
  }
}

function getWarnCount(client, guildId, userId) {
  try {
    const row = client.automodDB.prepare(`
      SELECT count FROM automod_warn_counts 
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);
    
    return row ? row.count : 0;
  } catch (error) {
    console.error('Error getting warn count:', error);
    return 0;
  }
}

function clearWarnsFromDB(client, guildId, userId) {
  try {
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
    console.error('Error clearing warns from DB:', error);
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
      return message.reply('You lack permissions.');
    }

    const targetArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    if (!targetArg) return message.reply('Provide a user.');

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not in server.');

    if (member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('Admins are immune.');

    const guildId = message.guild.id;

    // Add warn to database
    const success = addWarnToDB(client, guildId, targetUser.id, message.author.id, reason);
    if (!success) {
      return message.reply('Failed to add warning to database.');
    }

    // Get updated count
    const warnCount = getWarnCount(client, guildId, targetUser.id);

    // 🔹 Log to modstats (warn action)
    logModAction(client, guildId, message.author.id, targetUser.id, 'warn', reason);

    // AUTO BAN at 5 warns
    if (warnCount >= 5) {
      try {
        await member.ban({ reason: `Reached 5 warns | ${reason}` });
        
        // Clear warns after ban
        clearWarnsFromDB(client, guildId, targetUser.id);
        
        // 🔹 Log ban to modstats
        logModAction(client, guildId, 'AUTO-BAN-SYSTEM', targetUser.id, 'ban', `Auto-ban for reaching 5 warnings: ${reason}`);

        const banEmbed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('⚠️ User Auto-Banned')
          .addFields(
            { name: 'User', value: `<@${targetUser.id}>`, inline: false },
            { name: 'Reason', value: `Reached **5 warnings** (Automatic)`, inline: false },
            { name: 'Warning Count', value: `5/5`, inline: false }
          )
          .setTimestamp();

        return message.reply({ embeds: [banEmbed] });
      } catch (banError) {
        console.error('Auto-ban error:', banError);
        return message.reply('User reached 5 warnings but failed to auto-ban.');
      }
    }

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