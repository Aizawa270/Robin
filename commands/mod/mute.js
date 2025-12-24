const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

// Parse duration strings like "10s", "5m", "2h", "1d"
function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let ms = 0;
  switch (unit) {
    case 's': ms = value * 1000; break;
    case 'm': ms = value * 60 * 1000; break;
    case 'h': ms = value * 60 * 60 * 1000; break;
    case 'd': ms = value * 24 * 60 * 60 * 1000; break;
  }

  const max = 28 * 24 * 60 * 60 * 1000; // 28 days
  if (ms <= 0 || ms > max) return null;
  return ms;
}

// Format duration for display
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

module.exports = {
  name: 'mute',
  description: 'Timeout a user for a duration using Discord timeout.',
  category: 'mod',
  usage: '$mute <@user|userID> <duration> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    const memberPerms = message.member.permissions;
    const canModerate =
      memberPerms.has(PermissionFlagsBits.ModerateMembers) ||
      memberPerms.has(PermissionFlagsBits.Administrator);

    if (!canModerate) {
      return message.reply('You need **Timeout Members** permission or Administrator.');
    }

    // Get dynamic prefix
    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (args.length < 2) {
      const usageEmbed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('Mute Command Usage')
        .setDescription(
          '**Usage:**\n' +
          `\`${prefix}mute <@user|userID> <duration> [reason]\`\n\n` +
          '**Durations:**\n' +
          '`10s` - 10 seconds\n' +
          '`5m` - 5 minutes\n' +
          '`2h` - 2 hours\n' +
          '`1d` - 1 day (max 28 days)\n\n' +
          '**Examples:**\n' +
          `\`${prefix}mute @User 10m spamming\`\n` +
          `\`${prefix}mute 123456789012345678 1h advertising\`\n` +
          `\`${prefix}mute @User 1d severe rule violation\``
        );
      return message.reply({ embeds: [usageEmbed] });
    }

    const targetArg = args.shift();
    const durationArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    const targetUser = message.mentions.users.first() ||
                     (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) {
      return message.reply('User not found.');
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return message.reply('User not in this server.');
    }

    // Check various permission issues
    if (member.id === message.author.id) {
      return message.reply('You cannot mute yourself.');
    }
    
    if (member.id === client.user.id) {
      return message.reply('I cannot mute myself.');
    }
    
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Cannot mute an administrator.');
    }

    // Parse duration
    const durationMs = parseDuration(durationArg);
    if (!durationMs) {
      return message.reply('Invalid duration format. Use: `10s`, `5m`, `2h`, or `1d` (max 28 days).');
    }

    // Check bot permissions
    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('I need **Timeout Members** permission to mute users.');
    }

    if (!member.moderatable) {
      return message.reply('I cannot mute this user (insufficient permissions or higher role).');
    }

    try {
      console.log(`[Mute] Attempting to mute ${targetUser.id} for ${durationArg} by ${message.author.id}`);
      
      // Apply the timeout/mute
      await member.timeout(durationMs, `${reason} (muted by ${message.author.tag})`);
      console.log(`[Mute] Successfully muted ${targetUser.id}`);

      // 🔹 Log to modstats - WITH PROPER CLIENT PARAMETER
      console.log(`[Mute] Attempting to log to modstats...`);
      const logSuccess = logModAction(
        client,
        message.guild.id,
        message.author.id,
        targetUser.id,
        'mute',
        reason,
        durationArg
      );

      if (!logSuccess) {
        console.error('[Mute] Failed to log to modstats!');
      } else {
        console.log('[Mute] Successfully logged to modstats');
      }

      // Format duration for display
      const formattedDuration = formatDuration(durationMs);
      const endsAt = new Date(Date.now() + durationMs);
      
      // Create success embed
      const embed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('🔇 User Muted')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: false },
          { name: 'Muted by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Duration', value: `${durationArg} (${formattedDuration})`, inline: false },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Mute ends', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `Use ${prefix}unmute <user> to remove mute early` });

      await message.reply({ embeds: [embed] });

      // Try to DM the muted user
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor('#facc15')
          .setTitle('🔇 You have been muted')
          .setDescription(`You have been muted in **${message.guild.name}**`)
          .addFields(
            { name: 'Duration', value: `${durationArg} (${formattedDuration})`, inline: false },
            { name: 'Reason', value: reason, inline: false },
            { name: 'Mute ends', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: false },
            { name: 'Moderator', value: message.author.tag, inline: false }
          )
          .setTimestamp();

        await targetUser.send({ embeds: [dmEmbed] });
        console.log(`[Mute] Sent DM to ${targetUser.tag}`);
      } catch (dmError) {
        console.log(`[Mute] Could not DM ${targetUser.tag} (DMs might be disabled)`);
      }

      // Verify the log was actually added to database
      setTimeout(async () => {
        try {
          if (client.automodDB) {
            const verifyLog = client.automodDB.prepare(`
              SELECT * FROM modstats 
              WHERE moderator_id = ? AND target_id = ? AND action_type = 'mute'
              ORDER BY timestamp DESC LIMIT 1
            `).get(message.author.id, targetUser.id);
            
            if (verifyLog) {
              console.log(`[Mute] Verification: Mute log found with ID ${verifyLog.id}`);
            } else {
              console.log(`[Mute] Verification: No mute log found in database!`);
            }
          }
        } catch (verifyError) {
          console.error('[Mute] Verification error:', verifyError);
        }
      }, 1000);

    } catch (err) {
      console.error('Mute command error:', err);
      console.error(err.stack);
      
      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('❌ Failed to Mute User')
        .setDescription('There was an error trying to mute the user.')
        .addFields(
          { name: 'Error', value: err.message.substring(0, 200), inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [errorEmbed] });
    }
  },
};