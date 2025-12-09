const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'ban',
  description: 'Ban a user by mention or ID.',
  category: 'mod',
  usage: '$ban <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Only admins can ban
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Only admins can use this command.');
    }

    // If no args → show help embed
    if (!args.length) {
      const embed = new EmbedBuilder()
        .setColor(colors.roleinfo || '#fde047')
        .setTitle('Ban Command Usage')
        .setDescription(
          'Ban a user by mention or ID.\n\n' +
          '**Usage:**\n' +
          '`$ban <@user|userID> [reason]`\n\n' +
          '**Examples:**\n' +
          '`$ban @User spamming`\n' +
          '`$ban 123456789012345678 breaking rules`\n',
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

    // Prevent banning yourself / bot / admins
    if (targetUser.id === message.author.id) {
      return message.reply('You cannot ban yourself.');
    }
    if (targetUser.id === client.user.id) {
      return message.reply('I cannot ban myself.');
    }
    if (targetMember && targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You cannot ban an administrator.');
    }

    if (targetMember && !targetMember.bannable) {
      return message.reply('I cannot ban that user (role hierarchy or missing permissions).');
    }

    try {
      await message.guild.bans.create(targetUser.id, {
        reason: `${reason} (banned by ${message.author.tag})`,
      });

      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('User Banned')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          {
            name: 'User',
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: false,
          },
          {
            name: 'Banned by',
            value: `${message.author.tag} (${message.author.id})`,
            inline: false,
          },
          {
            name: 'Reason',
            value: reason,
            inline: false,
          },
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Ban command error:', err);
      await message.reply('There was an error trying to ban that user.');
    }
  },
};