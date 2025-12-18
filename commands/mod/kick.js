const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'kick',
  description: 'Kick a user by mention or ID.',
  aliases: ['k', 'K'],
  category: 'mod',
  usage: '$kick <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Mods with Kick Members permission can kick
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('You need the **Kick Members** permission to use this command.');
    }

    if (!args.length) {
      const embed = new EmbedBuilder()
        .setColor(colors.roleinfo || '#fb923c')
        .setTitle('Kick Command Usage')
        .setDescription(
          '**Usage:**\n' +
          '`$kick <@user|userID> [reason]`\n\n' +
          '**Examples:**\n' +
          '`$kick @User being rude`\n' +
          '`$kick 123456789012345678 spam`\n'
        );
      return message.reply({ embeds: [embed] });
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    const targetUser =
      message.mentions.users.first() ||
      (args[0] && (await client.users.fetch(args[0]).catch(() => null)));

    if (!targetUser) {
      return message.reply('Could not find that user. Use a mention or a valid user ID.');
    }

    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return message.reply('That user is not in this server.');
    }

    if (targetUser.id === message.author.id) {
      return message.reply('You cannot kick yourself.');
    }
    if (targetUser.id === client.user.id) {
      return message.reply('I cannot kick myself.');
    }
    if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You cannot kick an administrator.');
    }

    if (!targetMember.kickable) {
      return message.reply('I cannot kick that user (role hierarchy or missing permissions).');
    }

    try {
      await targetMember.kick(`${reason} (kicked by ${message.author.tag})`);

      const embed = new EmbedBuilder()
        .setColor(colors.roleinfo || '#fb923c')
        .setTitle('User Kicked')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
          { name: 'Kicked by', value: `${message.author.tag} (${message.author.id})`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Kick command error:', err);
      await message.reply('There was an error trying to kick that user.');
    }
  },
};