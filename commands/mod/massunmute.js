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

module.exports = {
  name: 'massunmute',
  description: 'Unmute multiple users at once.',
  category: 'mod',
  usage: '$massunmute @user1 @user2 ...',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mass Unmute Failed', 'This command only works in servers.')]
      });
    }

    const perms = message.member.permissions;
    if (!perms.has(PermissionFlagsBits.ModerateMembers) && !perms.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mass Unmute Failed', 'You need **Timeout Members** or admin permission.')]
      });
    }

    const targets = message.mentions.members;
    if (!targets.size) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Mass Unmute Failed', 'Mention at least one user.')]
      });
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    const unmuted = [];
    const failed = [];

    for (const [, member] of targets) {
      if (member.id === message.author.id || member.id === client.user.id || member.user.bot) {
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
        { name: 'Unmuted by', value: `<@${message.author.id}>`, inline: false }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};