// commands/mod/mute.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

// Parse durations like "10s", "5m", "2h", "1d"
function parseDuration(str) {
  if (!str) return null;
  const regex = /(\d+)\s*(s|m|h|d)/gi;
  let match;
  let totalMs = 0;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  while ((match = regex.exec(str)) !== null) {
    const v = Number(match[1]);
    const unit = match[2].toLowerCase();
    totalMs += v * (multipliers[unit] || 0);
  }
  const max = 28 * 24 * 60 * 60 * 1000;
  if (!totalMs || totalMs > max) return null;
  return totalMs;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days) return `${days} day${days !== 1 ? 's' : ''}`;
  if (hours) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  if (minutes) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

module.exports = {
  name: 'mute',
  description: 'Timeout a user for a duration.',
  category: 'mod',
  usage: '$mute <@user|userID> <duration> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return;

    const perms = message.member.permissions;
    if (!perms.has(PermissionFlagsBits.ModerateMembers) && !perms.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You need **Timeout Members** permission.');
    }

    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';
    if (!args.length) {
      const usage = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('Mute Command Usage')
        .setDescription(
          `**Usage:** \`${prefix}mute <@user|userID> <duration> [reason]\`\n\n` +
          `**Examples:**\n${prefix}mute @User 10m spamming\n${prefix}mute 123456789012345678 1h advertising`
        );
      return message.reply({ embeds: [usage] });
    }

    // Resolve target: mention or ID only
    let targetUser = message.mentions.users.first();
    if (!targetUser && args[0] && /^\d{17,20}$/.test(args[0])) {
      targetUser = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!targetUser) {
      return message.reply('User not found. Mention them or provide a valid user ID.');
    }

    // shift target arg if it was an ID/mention
    if (args[0] && (args[0].includes(targetUser.id) || args[0].startsWith('<@'))) args.shift();

    const durationArg = args.shift();
    if (!durationArg) return message.reply('Provide a duration (e.g. `10m`, `1h`).');

    const reason = args.join(' ') || 'No reason provided';

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not in this server.');

    if (member.id === message.author.id) return message.reply('You cannot mute yourself.');
    if (member.id === client.user.id) return message.reply('I cannot mute myself.');
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('Cannot mute an administrator.');

    const durationMs = parseDuration(durationArg);
    if (!durationMs) return message.reply('Invalid duration format. Examples: `10m`, `1h30m`, `2d`.');

    // Check bot permissions
    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('I need **Timeout Members** permission to mute users.');
    }

    if (!member.moderatable) {
      return message.reply('I cannot mute this user (insufficient permissions or higher role).');
    }

    // Already muted check
    if (member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now()) {
      const alreadyEmbed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('User Already Muted')
        .setDescription(`<@${member.id}> is already muted.`)
        .addFields({
          name: 'Mute ends',
          value: `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`,
        });
      return message.reply({ embeds: [alreadyEmbed] });
    }

    try {
      await member.timeout(durationMs, `${reason} (muted by ${message.author.tag})`);

      try {
        logModAction(client, message.guild.id, message.author.id, targetUser.id, 'mute', reason, durationArg);
      } catch (err) {
        console.error('[Mute] logModAction failed:', err);
      }

      const endsAt = new Date(Date.now() + durationMs);
      const embed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('User Muted')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>` },
          { name: 'Muted by', value: `<@${message.author.id}>` },
          { name: 'Duration', value: `${durationArg} (${formatDuration(durationMs)})` },
          { name: 'Reason', value: reason },
          { name: 'Mute ends', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>` }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Mute error:', err);
      await message.reply('Failed to mute the user.');
    }
  },
};