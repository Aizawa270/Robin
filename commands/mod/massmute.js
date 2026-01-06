const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Supports: 10s, 5m, 1h30m, 2d4h10m, etc
function parseDuration(input) {
  if (!input) return null;

  const regex = /(\d+)\s*(s|m|h|d)/gi;
  let match;
  let totalMs = 0;

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  while ((match = regex.exec(input)) !== null) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    totalMs += value * multipliers[unit];
  }

  const max = 28 * 24 * 60 * 60 * 1000; // Discord limit
  if (!totalMs || totalMs > max) return null;

  return totalMs;
}

module.exports = {
  name: 'massmute',
  description: 'Mute multiple users at once.',
  category: 'mod',
  usage: '$massmute @users <duration> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('You need **Timeout Members** permission.');
    }

    const targets = message.mentions.members;
    if (!targets.size) {
      return message.reply('Mention at least one user.');
    }

    // Remove mentions from args
    const cleanedArgs = args.filter(
      a => !a.match(/^<@!?(\d+)>$/)
    );

    if (!cleanedArgs.length) {
      return message.reply('Provide a duration.');
    }

    // Find first arg that parses as duration
    let durationMs = null;
    let durationArg = null;

    for (const arg of cleanedArgs) {
      const parsed = parseDuration(arg);
      if (parsed) {
        durationMs = parsed;
        durationArg = arg;
        break;
      }
    }

    if (!durationMs) {
      return message.reply(
        'Invalid duration.\nExamples: `10m`, `1h30m`, `2d4h`, `45s`'
      );
    }

    const reason = cleanedArgs
      .filter(a => a !== durationArg)
      .join(' ') || 'No reason provided';

    const muted = [];
    const failed = [];

    for (const [, member] of targets) {
      if (
        member.user.bot ||
        !member.moderatable ||
        member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        failed.push(member);
        continue;
      }

      try {
        await member.timeout(
          durationMs,
          `${reason} (muted by ${message.author.tag})`
        );
        muted.push(member);
      } catch {
        failed.push(member);
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle('Mass Mute')
      .addFields(
        {
          name: 'Muted',
          value: muted.length
            ? muted.map(m => `<@${m.id}>`).join('\n')
            : 'None',
        },
        {
          name: 'Failed',
          value: failed.length
            ? failed.map(m => `<@${m.id}>`).join('\n')
            : 'None',
        },
        { name: 'Duration', value: durationArg },
        { name: 'Reason', value: reason },
        { name: 'Moderator', value: `<@${message.author.id}>` }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};