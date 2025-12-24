const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'kick',
  description: 'Kick a user by mention or ID.',
  aliases: ['k', 'K'],
  category: 'mod',
  usage: '$kick <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('Server only.');

    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('You need **Kick Members** permission.');
    }

    // Get dynamic prefix
    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    if (!args.length) {
      const embed = new EmbedBuilder()
        .setColor('#fb923c')
        .setTitle('Kick Command Usage')
        .setDescription(
          '**Usage:**\n' +
          `\`${prefix}kick <@user|userID> [reason]\`\n\n` +
          '**Examples:**\n' +
          `\`${prefix}kick @User being rude\`\n` +
          `\`${prefix}kick 123456789012345678 spam\``
        );
      return message.reply({ embeds: [embed] });
    }

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(args[0]).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) return message.reply('User not in this server.');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    if (targetUser.id === message.author.id)
      return message.reply('You cannot kick yourself.');

    if (targetUser.id === client.user.id)
      return message.reply('I cannot kick myself.');

    if (targetMember.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('You cannot kick an administrator.');

    if (!targetMember.kickable)
      return message.reply('I cannot kick that user.');

    try {
      await targetMember.kick(`${reason} (kicked by ${message.author.tag})`);

      // 🔹 Log to modstats - WITH PROPER CLIENT PARAMETER
      const logSuccess = logModAction(
        client,
        message.guild.id,
        message.author.id,
        targetUser.id,
        'kick',
        reason
      );

      if (!logSuccess) {
        console.error('[Kick] Failed to log to modstats');
      }

      const embed = new EmbedBuilder()
        .setColor('#fb923c')
        .setTitle('User Kicked')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: false },
          { name: 'Kicked by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Kick command error:', err);
      await message.reply('Failed to kick the user.');
    }
  },
};