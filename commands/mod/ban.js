const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { colors } = require('../../config');
const { logModAction } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'ban',
  aliases: ['B', 'b'],
  description: 'Ban a user by mention or ID.',
  category: 'mod',
  usage: '$ban <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('Server only.');

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('You need **Ban Members** permission.');
    }

    if (!args.length) {
      const embed = new EmbedBuilder()
        .setColor(colors.roleinfo || '#fde047')
        .setTitle('Ban Command Usage')
        .setDescription(
          '**Usage:**\n' +
          '`$ban <@user|userID> [reason]`\n\n' +
          '**Examples:**\n' +
          '`$ban @User spamming`\n' +
          '`$ban 123456789012345678 breaking rules`'
        );
      return message.reply({ embeds: [embed] });
    }

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(args[0]).catch(() => null));

    if (!targetUser) {
      return message.reply('User not found.');
    }

    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
    const reason = args.slice(1).join(' ') || 'No reason provided';

    if (targetUser.id === message.author.id)
      return message.reply('You cannot ban yourself.');

    if (targetUser.id === client.user.id)
      return message.reply('I cannot ban myself.');

    if (
      targetMember &&
      targetMember.roles.highest.position >= message.member.roles.highest.position
    ) {
      return message.reply('You cannot ban someone with equal or higher role.');
    }

    if (targetMember && !targetMember.bannable) {
      return message.reply('I cannot ban that user.');
    }

    try {
      await message.guild.bans.create(targetUser.id, {
        reason: `${reason} (banned by ${message.author.tag})`,
      });

      // 🔹 Log to modstats
      logModAction(client, message.guild.id, message.author.id, targetUser.id, 'ban', reason);

      const fakeUserPing = `<@${targetUser.id}>`;
      const fakeModPing = `<@${message.author.id}>`;

      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('User Banned')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: fakeUserPing, inline: false },
          { name: 'Banned by', value: fakeModPing, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Ban command error:', err);
      await message.reply('Failed to ban the user.');
    }
  },
};