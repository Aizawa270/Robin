const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'ban',
  aliases: ['B', 'b'],
  description: 'Ban a user by reply, mention, or ID.',
  category: 'mod',
  usage: '$ban <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('Server only.');

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('You need **Ban Members** permission.');
    }

    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (!args.length && !message.reference) {
      return message.reply(
        `Usage: \`${prefix}ban <@user|userID> [reason]\` or reply + \`${prefix}ban\``
      );
    }

    // ✅ 1. REPLY TARGET
    let targetUser = null;

    if (message.reference?.messageId) {
      const repliedMsg = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch(() => null);

      if (repliedMsg) targetUser = repliedMsg.author;
    }

    // ✅ 2. MENTION
    if (!targetUser) {
      targetUser = message.mentions.users.first();
    }

    // ✅ 3. ID
    if (!targetUser && args[0]) {
      targetUser = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!targetUser) {
      return message.reply('User not found.');
    }

    const targetMember = await message.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

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

    // ✅ ALREADY BANNED CHECK
    const existingBan = await message.guild.bans
      .fetch(targetUser.id)
      .catch(() => null);

    if (existingBan) {
      const alreadyBannedEmbed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('Already Banned')
        .setDescription(`<@${targetUser.id}> is already banned from this server.`)
        .setTimestamp();

      return message.reply({ embeds: [alreadyBannedEmbed] });
    }

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