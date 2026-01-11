const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

// Parse duration strings like "10s", "5m", "2h", "1d"
function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const map = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  const ms = value * map[unit];
  const max = 28 * 24 * 60 * 60 * 1000;
  if (!ms || ms > max) return null;

  return ms;
}

// Format duration for display
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (d) return `${d} day${d !== 1 ? 's' : ''}`;
  if (h) return `${h} hour${h !== 1 ? 's' : ''}`;
  if (m) return `${m} minute${m !== 1 ? 's' : ''}`;
  return `${s} second${s !== 1 ? 's' : ''}`;
}

module.exports = {
  name: 'mute',
  description: 'Timeout a user for a duration.',
  category: 'mod',
  usage: '$mute <@user|userID|reply> <duration> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return;

    const perms = message.member.permissions;
    if (
      !perms.has(PermissionFlagsBits.ModerateMembers) &&
      !perms.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('You need **Timeout Members** permission.');
    }

    // ───── TARGET RESOLUTION (FIXED) ─────
    let targetUser = message.mentions.users.first();

    if (!targetUser && message.reference?.messageId) {
      const replied = await message.channel.messages.fetch(
        message.reference.messageId
      ).catch(() => null);
      targetUser = replied?.author;
    }

    if (!targetUser && args[0]) {
      targetUser = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!targetUser) {
      return message.reply('User not found.');
    }

    // Remove target arg if present
    if (args[0]?.includes(targetUser.id)) args.shift();

    const durationArg = args.shift();
    if (!durationArg) {
      return message.reply('Provide a duration (e.g. `10m`, `1h`).');
    }

    const reason = args.join(' ') || 'No reason provided';

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not in this server.');

    if (member.id === message.author.id)
      return message.reply('You cannot mute yourself.');

    if (member.id === client.user.id)
      return message.reply('I cannot mute myself.');

    if (member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('Cannot mute an administrator.');

    const durationMs = parseDuration(durationArg);
    if (!durationMs) {
      return message.reply('Invalid duration format.');
    }

    if (!member.moderatable) {
      return message.reply('I cannot mute this user.');
    }

    // ───── ALREADY MUTED CHECK (FIXED) ─────
    if (
      member.communicationDisabledUntilTimestamp &&
      member.communicationDisabledUntilTimestamp > Date.now()
    ) {
      const alreadyEmbed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('User Already Muted')
        .setDescription(`<@${member.id}> is already muted.`)
        .addFields({
          name: 'Mute ends',
          value: `<t:${Math.floor(
            member.communicationDisabledUntilTimestamp / 1000
          )}:R>`,
        });

      return message.reply({ embeds: [alreadyEmbed] });
    }

    // ───── APPLY MUTE ─────
    try {
      await member.timeout(
        durationMs,
        `${reason} (muted by ${message.author.tag})`
      );

      logModAction(
        client,
        message.guild.id,
        message.author.id,
        targetUser.id,
        'mute',
        reason,
        durationArg
      );

      const endsAt = new Date(Date.now() + durationMs);
      const embed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('User Muted')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>` },
          { name: 'Muted by', value: `<@${message.author.id}>` },
          {
            name: 'Duration',
            value: `${durationArg} (${formatDuration(durationMs)})`,
          },
          { name: 'Reason', value: reason },
          {
            name: 'Mute ends',
            value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`,
          }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('Mute error:', err);
      await message.reply('Failed to mute the user.');
    }
  },
};