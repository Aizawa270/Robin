const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

function getRolePos(member) {
  return member?.roles?.highest?.position ?? 0;
}

function isOwner(guild, member) {
  return !!guild?.ownerId && member?.id === guild.ownerId;
}

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

  const max = 28 * 24 * 60 * 60 * 1000;
  if (!totalMs || totalMs > max) return null;

  return totalMs;
}

module.exports = {
  name: 'massmute',
  description: 'Mute multiple users at once.',
  category: 'mod',
  usage: '$massmute @users <duration> [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Mass Mute Failed', 'This command only works in servers.')] });
    }

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Mass Mute Failed', 'You need **Timeout Members** permission.')] });
    }

    const targets = message.mentions.members;
    if (!targets.size) {
      return message.reply({ embeds: [makeEmbed('#f59e0b', 'Mass Mute Failed', 'Mention at least one user.')] });
    }

    const cleanedArgs = args.filter(a => !a.match(/^<@!?(\d+)>$/));
    if (!cleanedArgs.length) {
      return message.reply({ embeds: [makeEmbed('#f59e0b', 'Mass Mute Failed', 'Provide a duration.')] });
    }

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
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Mass Mute Failed', 'Invalid duration.\nExamples: `10m`, `1h30m`, `2d4h`, `45s`.')]
      });
    }

    const reason = cleanedArgs.filter(a => a !== durationArg).join(' ').trim() || 'No reason provided';
    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    const muted = [];
    const failed = [];

    for (const [, member] of targets) {
      if (
        member.id === message.author.id ||
        member.id === client.user.id ||
        member.user.bot
      ) {
        failed.push(member);
        continue;
      }

      if (isOwner(message.guild, member) && !isOwner(message.guild, message.member)) {
        failed.push(member);
        continue;
      }

      if (!isOwner(message.guild, message.member) && getRolePos(member) >= getRolePos(message.member)) {
        failed.push(member);
        continue;
      }

      if (botMember && getRolePos(member) >= getRolePos(botMember)) {
        failed.push(member);
        continue;
      }

      if (member.permissions.has(PermissionFlagsBits.Administrator) || !member.moderatable) {
        failed.push(member);
        continue;
      }

      try {
        await member.timeout(durationMs, `${reason} (muted by ${message.author.tag})`);
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
          value: muted.length ? muted.map(m => `<@${m.id}>`).join('\n') : 'None',
        },
        {
          name: 'Failed',
          value: failed.length ? failed.map(m => `<@${m.id}>`).join('\n') : 'None',
        },
        { name: 'Duration', value: durationArg, inline: false },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Moderator', value: `<@${message.author.id}>`, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};