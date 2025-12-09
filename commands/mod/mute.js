const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// parse duration strings like "10s", "5m", "2h", "1d"
function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let ms = 0;
  switch (unit) {
    case 's':
      ms = value * 1000;
      break;
    case 'm':
      ms = value * 60 * 1000;
      break;
    case 'h':
      ms = value * 60 * 60 * 1000;
      break;
    case 'd':
      ms = value * 24 * 60 * 60 * 1000;
      break;
  }

  const max = 28 * 24 * 60 * 60 * 1000; // 28 days
  if (ms <= 0 || ms > max) return null;
  return ms;
}

module.exports = {
  name: 'mute',
  description: 'Timeout a user for a duration using Discord timeout.',
  category: 'mod',
  usage: '$mute <@user|userID> <duration> [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Staff: must have ModerateMembers OR be Admin
    const memberPerms = message.member.permissions;
    const canModerate =
      memberPerms.has(PermissionFlagsBits.ModerateMembers) ||
      memberPerms.has(PermissionFlagsBits.Administrator);

    if (!canModerate) {
      return message.reply(
        'You need the **Timeout Members** permission or be an admin to use this command.',
      );
    }

    // If not enough args → show usage embed
    if (args.length < 2) {
      const usageEmbed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('Mute Command Usage')
        .setDescription(
          'Timeout (mute) a user using Discord timeouts.\n\n' +
            '**Usage:**\n' +
            '`$mute <@user|userID> <duration> [reason]`\n\n' +
            '**Durations:** `10s`, `5m`, `2h`, `1d` (up to 28d)\n\n' +
            '**Examples:**\n' +
            '`$mute @User 10m spamming`\n' +
            '`$mute 123456789012345678 1h advertising`\n',
        );
      return message.reply({ embeds: [usageEmbed] });
    }

    const targetArg = args.shift();
    const durationArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    const targetUser =
      message.mentions.users.first() ||
      (targetArg && (await client.users.fetch(targetArg).catch(() => null)));

    if (!targetUser) {
      return message.reply('Could not find that user. Use a mention or a valid user ID.');
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return message.reply('That user is not in this server.');
    }

    if (member.id === message.author.id) {
      return message.reply('You cannot mute yourself.');
    }
    if (member.id === client.user.id) {
      return message.reply('I cannot mute myself.');
    }
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You cannot mute an administrator.');
    }

    const durationMs = parseDuration(durationArg);
    if (!durationMs) {
      return message.reply(
        'Invalid duration. Use formats like `10s`, `5m`, `2h`, `1d` (max 28d).',
      );
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply(
        'I need the **Timeout Members** (Moderate Members) permission to mute users.',
      );
    }

    if (!member.moderatable) {
      return message.reply('I cannot mute that user (role hierarchy or missing permissions).');
    }

    try {
      await member.timeout(durationMs, `${reason} (muted by ${message.author.tag})`);

      const embed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('User Muted (Timeout)')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          {
            name: 'User',
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: false,
          },
          {
            name: 'Muted by',
            value: `${message.author.tag} (${message.author.id})`,
            inline: false,
          },
          {
            name: 'Duration',
            value: durationArg,
            inline: false,
          },
          {
            name: 'Reason',
            value: reason,
            inline: false,
          },
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Mute command error:', err);
      await message.reply('There was an error trying to mute that user.');
    }
  },
};