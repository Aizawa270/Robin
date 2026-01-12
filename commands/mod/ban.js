// commands/mod/ban.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'ban',
  aliases: ['B', 'b'],
  description: 'Ban a user by mention or ID.',
  category: 'mod',
  usage: '$ban <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command can only be used in a server.');

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('You need **Ban Members** permission.');
    }

    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    // No args => show usage embed
    if (!args.length) {
      const usageEmbed = new EmbedBuilder()
        .setColor('#f43f5e')
        .setTitle('Ban Command Usage')
        .setDescription(`**Usage:** \`${prefix}ban <@user|userID> [reason]\`\n\n**Examples:**\n${prefix}ban @User spamming\n${prefix}ban 123456789012345678 breaking rules`);
      return message.reply({ embeds: [usageEmbed] });
    }

    // ✅ Target: mention or ID only
    let targetUser = message.mentions.users.first();
    if (!targetUser && args[0]) {
      targetUser = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!targetUser) {
      const usageEmbed = new EmbedBuilder()
        .setColor('#f43f5e')
        .setTitle('Ban Command Usage')
        .setDescription(`**Usage:** \`${prefix}ban <@user|userID> [reason]\`\n\n**Examples:**\n${prefix}ban @User spamming\n${prefix}ban 123456789012345678 breaking rules`);
      return message.reply({ embeds: [usageEmbed] });
    }

    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);

    const reason = args.slice(1).join(' ') || 'No reason provided';

    if (targetUser.id === message.author.id)
      return message.reply('You cannot ban yourself.');

    if (targetUser.id === client.user.id)
      return message.reply('I cannot ban myself.');

    if (targetMember && targetMember.roles.highest.position >= message.member.roles.highest.position) {
      return message.reply('You cannot ban someone with equal or higher role.');
    }

    if (targetMember && !targetMember.bannable) {
      return message.reply('I cannot ban that user.');
    }

    // ✅ Already banned
    const existingBan = await message.guild.bans.fetch(targetUser.id).catch(() => null);
    if (existingBan) {
      const alreadyBannedEmbed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('Already Banned')
        .setDescription(`<@${targetUser.id}> is already banned from this server.`)
        .setTimestamp();
      return message.reply({ embeds: [alreadyBannedEmbed] });
    }

    // ✅ Ban action
    try {
      await message.guild.bans.create(targetUser.id, {
        reason: `${reason} (banned by ${message.author.tag})`,
      });

      logModAction(
        client,
        message.guild.id,
        message.author.id,
        targetUser.id,
        'ban',
        reason
      );

      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('User Banned')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>` },
          { name: 'Banned by', value: `<@${message.author.id}>` },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Ban command error:', err);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Failed to Ban User')
        .setDescription('There was an error trying to ban the user.');

      await message.reply({ embeds: [errorEmbed] });
    }
  },
};