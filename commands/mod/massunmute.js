const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'massunmute',
  description: 'Unmute multiple users at once.',
  category: 'mod',
  usage: '$massunmute @user1 @user2 ...',
  async execute(client, message, args) {
    if (!message.guild) return;

    const memberPerms = message.member.permissions;
    if (!memberPerms.has(PermissionFlagsBits.ModerateMembers) &&
        !memberPerms.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You need **Timeout Members** or admin permission.');
    }

    const targets = message.mentions.members;
    if (!targets.size) return message.reply('Mention at least one user.');

    const unmuted = [];
    const failed = [];

    for (const [, member] of targets) {
      if (member.user.bot) continue;
      if (!member.moderatable) {
        failed.push(member);
        continue;
      }
      try {
        await member.timeout(null, `Mass unmuted by ${message.author.tag}`);
        unmuted.push(member);
      } catch {
        failed.push(member);
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setTitle('Users Unmuted')
      .setThumbnail(message.guild.iconURL({ dynamic: true, size: 1024 }))
      .addFields(
        { name: 'Unmuted Users', value: unmuted.length ? unmuted.map(m => `<@${m.id}>`).join('\n') : 'None', inline: false },
        { name: 'Failed', value: failed.length ? failed.map(m => `<@${m.id}>`).join('\n') : 'None', inline: false },
        { name: 'Unmuted by', value: message.author.tag, inline: false },
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};