// commands/mod/warn.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// DB helpers (kept from your file)
function getWarnCountFromDB(client, guildId, userId) {
  try {
    if (!client.automodDB) return 0;
    const row = client.automodDB.prepare(`
      SELECT count FROM automod_warn_counts WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);
    return row ? row.count : 0;
  } catch (e) {
    console.error('[Warn] getWarnCountFromDB error:', e);
    return 0;
  }
}

function addWarnToDB(client, guildId, userId, moderatorId, reason) {
  try {
    if (!client.automodDB) return false;
    client.automodDB.prepare(`
      INSERT INTO automod_warns (guild_id, user_id, moderator_id, reason, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, moderatorId, reason || 'No reason provided', Date.now());

    client.automodDB.prepare(`
      INSERT OR REPLACE INTO automod_warn_counts (guild_id, user_id, count)
      VALUES (?, ?, COALESCE((SELECT count FROM automod_warn_counts WHERE guild_id = ? AND user_id = ?), 0) + 1)
    `).run(guildId, userId, guildId, userId);

    return true;
  } catch (e) {
    console.error('[Warn] addWarnToDB error:', e);
    return false;
  }
}

function clearWarnsFromDB(client, guildId, userId) {
  try {
    if (!client.automodDB) return false;
    client.automodDB.prepare(`DELETE FROM automod_warns WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
    client.automodDB.prepare(`DELETE FROM automod_warn_counts WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
    return true;
  } catch (e) {
    console.error('[Warn] clearWarnsFromDB error:', e);
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
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
        !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You need Moderate Members permission.');
    }

    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';
    if (!args.length) {
      const usage = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('Warn Command Usage')
        .setDescription(`**Usage:** \`${prefix}warn <@user|userID> <reason>\`\n\nExamples:\n${prefix}warn @User spamming`);
      return message.reply({ embeds: [usage] });
    }

    // Resolve target: mention or ID only
    let targetUser = message.mentions.users.first();
    if (!targetUser && args[0] && /^\d{17,20}$/.test(args[0])) {
      targetUser = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!targetUser) return message.reply('User not found. Mention them or provide a valid user ID.');

    // Remove target arg if used
    if (args[0] && (args[0].includes(targetUser.id) || args[0].startsWith('<@'))) args.shift();

    const reason = args.join(' ') || 'No reason provided';
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not in server.');

    if (member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('Cannot warn an administrator.');

    // Add warn to DB
    const added = addWarnToDB(client, message.guild.id, targetUser.id, message.author.id, reason);
    if (!added) return message.reply('Failed to add warning to database.');

    // log to modstats (dynamic import to avoid cycles)
    try {
      const { logModAction } = require('../../handlers/modstatsHelper');
      logModAction(client, message.guild.id, message.author.id, targetUser.id, 'warn', reason);
    } catch (err) {
      console.error('[Warn] logModAction failed:', err);
    }

    const warnCount = getWarnCountFromDB(client, message.guild.id, targetUser.id);

    // Auto-ban at 5 warns
    if (warnCount >= 5) {
      try {
        await member.ban({ reason: `Auto-ban: reached 5 warns (${reason})` });
        clearWarnsFromDB(client, message.guild.id, targetUser.id);
        try {
          const { logModAction } = require('../../handlers/modstatsHelper');
          logModAction(client, message.guild.id, 'AUTO-BAN-SYSTEM', targetUser.id, 'ban', 'Auto-ban for reaching 5 warnings');
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
      } catch (banErr) {
        console.error('[Warn] Auto-ban failed:', banErr);
        return message.reply('User reached 5 warnings but auto-ban failed.');
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