const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Parse duration like "10s", "5m", "2h", "1d"
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

  const max = 28 * 24 * 60 * 60 * 1000; // 28 days max
  if (ms <= 0 || ms > max) return null;
  return ms;
}

module.exports = {
  name: 'massmute',
  description: 'Mute multiple users at once with a single duration and reason.',
  category: 'mod',
  usage: '$massmute <duration> @user1 @user2 ... [reason]',
  async execute(client, message, args) {
    if (!message.guild) return;

    const perms = message.member.permissions;
    if (!perms.has(PermissionFlagsBits.ModerateMembers) &&
        !perms.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You need **Timeout Members** permission or be admin.');
    }

    const durationArg = args.shift();
    if (!durationArg) return message.reply('Specify a duration: `10s`, `5m`, `2h`, `1d`.');

    const durationMs = parseDuration(durationArg);
    if (!durationMs) return message.reply('Invalid duration format.');

    const reason = args.join(' ') || 'No reason provided';

    const targets = message.mentions.members;
    if (!targets.size) return message.reply('Mention at least one user.');

    const muted = [];
    const failed = [];

    for (const [, member] of targets) {
      if (member.user.bot) continue;
      if (!member.moderatable || member.permissions.has(PermissionFlagsBits.Administrator)) {
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

    // 🔹 Fake pings for blue mention look
    const mutedList = muted.length ? muted.map(m => `<@${m.id}>`).join('\n') : 'None';
    const failedList = failed.length ? failed.map(m => `<@${m.id}>`).join('\n') : 'None';
    const modFakePing = `<@${message.author.id}>`;

    const embed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle('Users Muted (Timeout)')
      .setThumbnail(message.guild.iconURL({ dynamic: true, size: 1024 }))
      .addFields(
        { name: 'Muted Users', value: mutedList, inline: false },
        { name: 'Failed', value: failedList, inline: false },
        { name: 'Muted by', value: modFakePing, inline: false },
        { name: 'Duration', value: durationArg, inline: false },
        { name: 'Reason', value: reason, inline: false },
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};