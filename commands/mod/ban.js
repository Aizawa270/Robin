const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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

    // Get dynamic prefix
    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (!args.length) {
      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Ban Command Usage')
        .setDescription(
          '**Usage:**\n' +
          `\`${prefix}ban <@user|userID> [reason]\`\n\n` +
          '**Examples:**\n' +
          `\`${prefix}ban @User spamming\`\n` +
          `\`${prefix}ban 123456789012345678 breaking rules\``
        )
        .setFooter({ text: `Use ${prefix}help for more info` });

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

      // 🔹 Log to modstats - WITH PROPER CLIENT PARAMETER
      const logSuccess = logModAction(
        client,
        message.guild.id,
        message.author.id,
        targetUser.id,
        'ban',
        reason
      );

      if (!logSuccess) {
        console.error('[Ban] Failed to log to modstats');
      }

      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('User Banned')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: false },
          { name: 'Banned by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `Banned by ${message.author.tag}` });

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Ban command error:', err);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Failed to Ban User')
        .setDescription('There was an error trying to ban the user.')
        .addFields(
          { name: 'Error', value: err.message.substring(0, 100), inline: false }
        );

      await message.reply({ embeds: [errorEmbed] });
    }
  },
};