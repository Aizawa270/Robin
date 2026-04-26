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
  name: 'unmute',
  description: 'Remove timeout from a user.',
  category: 'mod',
  usage: '$unmute <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'Server only.')] });
    }

    const memberPerms = message.member.permissions;
    if (!memberPerms.has(PermissionFlagsBits.ModerateMembers) && !memberPerms.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'You need **Timeout Members** permission or admin.')] });
    }

    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (!args.length) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#facc15')
            .setTitle('Unmute Command Usage')
            .setDescription(
              '**Usage:**\n' +
              `\`${prefix}unmute <@user|userID> [reason]\`\n\n` +
              '**Examples:**\n' +
              `\`${prefix}unmute @User spamming ended\`\n` +
              `\`${prefix}unmute 123456789012345678 apology\`\n`
            )
            .setTimestamp(),
        ],
      });
    }

    const targetArg = args.shift();
    const reason = args.join(' ').trim() || 'No reason provided';

    let targetUser = message.mentions.users.first();
    if (!targetUser && /^\d{17,20}$/.test(targetArg)) {
      targetUser = await client.users.fetch(targetArg).catch(() => null);
    }

    if (!targetUser) {
      return message.reply({ embeds: [makeEmbed('#f59e0b', 'Unmute Failed', 'User not found.')] });
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    if (!member) {
      return message.reply({ embeds: [makeEmbed('#f59e0b', 'Unmute Failed', 'User not in this server.')] });
    }

    if (member.id === message.author.id) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'You cannot unmute yourself.')] });
    }

    if (member.id === client.user.id) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'I cannot unmute myself.')] });
    }

    if (isOwner(message.guild, member) && !isOwner(message.guild, message.member)) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'You cannot unmute the server owner.')] });
    }

    if (!isOwner(message.guild, message.member)) {
      if (getRolePos(member) >= getRolePos(message.member)) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'You cannot unmute someone with equal or higher role.')]
        });
      }
    }

    if (botMember && getRolePos(member) >= getRolePos(botMember)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'I cannot unmute that user because my role is too low.')]
      });
    }

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'Cannot unmute an administrator.')] });
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'I need **Timeout Members** permission.')] });
    }

    if (!member.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp < Date.now()) {
      return message.reply({ embeds: [makeEmbed('#f59e0b', 'Unmute Failed', 'This user is not muted.')] });
    }

    try {
      await member.timeout(null, `${reason} (unmuted by ${message.author.tag})`);

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('User Unmuted')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: false },
          { name: 'Unmuted by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Unmute command error:', err);
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Unmute Failed', 'Failed to unmute the user.')] });
    }
  },
};