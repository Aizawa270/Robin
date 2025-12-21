const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { logModAction } = require('../../handlers/modstatsHelper');

// Path to your existing warns.json
const WARN_FILE = path.join(__dirname, '../../warns.json');

// Load existing warns from JSON
function loadWarns() {
  try {
    if (fs.existsSync(WARN_FILE)) {
      return JSON.parse(fs.readFileSync(WARN_FILE, 'utf8'));
    }
    return {};
  } catch {
    return {};
  }
}

// Save warns to JSON
function saveWarns(data) {
  try {
    fs.writeFileSync(WARN_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving warns to JSON:', error);
    return false;
  }
}

// Add warn to SQLite database
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

// Get warn count from SQLite
function getWarnCountFromDB(client, guildId, userId) {
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

// Clear warns from SQLite (for auto-ban)
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

    // 1. ADD TO SQLITE DATABASE (for automod system)
    const dbSuccess = addWarnToDB(client, guildId, targetUser.id, message.author.id, reason);
    
    if (!dbSuccess) {
      return message.reply('Failed to add warning to database.');
    }

    // 2. ADD TO JSON FILE (for your existing warns.js)
    const warns = loadWarns();
    if (!warns[targetUser.id]) warns[targetUser.id] = [];

    warns[targetUser.id].unshift({
      reason: reason,
      moderator: `${message.author.tag} (${message.author.id})`,
      timestamp: new Date().toISOString(),
    });

    const jsonSuccess = saveWarns(warns);
    
    if (!jsonSuccess) {
      console.warn('Failed to save warn to JSON file, but SQLite entry was successful.');
    }

    // Get total warn count (from SQLite for consistency)
    const warnCount = getWarnCountFromDB(client, guildId, targetUser.id);

    // 🔹 Log to modstats
    logModAction(client, guildId, message.author.id, targetUser.id, 'warn', reason);

    // AUTO BAN at 5 warns
    if (warnCount >= 5) {
      try {
        await member.ban({ reason: `Reached 5 warns | ${reason}` });
        
        // Clear warns from both systems after ban
        clearWarnsFromDB(client, guildId, targetUser.id);
        
        // Remove from JSON file
        delete warns[targetUser.id];
        saveWarns(warns);
        
        // 🔹 Log ban to modstats
        logModAction(client, guildId, 'AUTO-BAN-SYSTEM', targetUser.id, 'ban', `Auto-ban for reaching 5 warnings: ${reason}`);

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