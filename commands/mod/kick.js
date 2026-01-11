const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'kick',
  description: 'Kick a user by reply, mention, or ID.',
  aliases: ['k', 'K'],
  category: 'mod',
  usage: '$kick <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('Server only.');

    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('You need **Kick Members** permission.');
    }

    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (!args.length && !message.reference) {
      return message.reply(
        `Usage: \`${prefix}kick <@user|userID> [reason]\` or reply + \`${prefix}kick\``
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

    // 🚫 prevents fake kick messages
    if (!targetMember) {
      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('Kick Failed')
        .setDescription(`<@${targetUser.id}> is not in this server.`)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    if (targetUser.id === message.author.id)
      return message.reply('You cannot kick yourself.');

    if (targetUser.id === client.user.id)
      return message.reply('I cannot kick myself.');

    if (
      targetMember.roles.highest.position >= message.member.roles.highest.position
    ) {
      return message.reply('You cannot kick someone with equal or higher role.');
    }

    if (!targetMember.kickable) {
      return message.reply('I cannot kick that user.');
    }

    try {
      await targetMember.kick(`${reason} (kicked by ${message.author.tag})`);

      logModAction(
        client,
        message.guild.id,
        message.author.id,
        targetUser.id,
        'kick',
        reason
      );

      const embed = new EmbedBuilder()
        .setColor('#fb923c')
        .setTitle('User Kicked')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>` },
          { name: 'Kicked by', value: `<@${message.author.id}>` },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Kick command error:', err);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Failed to Kick User')
        .setDescription('There was an error trying to kick the user.');

      await message.reply({ embeds: [errorEmbed] });
    }
  },
};