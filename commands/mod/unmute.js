const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'unmute',
  description: 'Remove timeout (mute) from a user.',
  category: 'mod',
  usage: '$unmute <@user|userID>',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Staff check: user must have Moderate Members OR be Admin
    const memberPerms = message.member.permissions;
    const canModerate =
      memberPerms.has(PermissionFlagsBits.ModerateMembers) ||
      memberPerms.has(PermissionFlagsBits.Administrator);

    if (!canModerate) {
      return message.reply(
        'You need the **Timeout Members** permission or be an admin to use this command.',
      );
    }

    if (!args.length) {
      return message.reply('Usage: `$unmute <@user|userID>`');
    }

    const targetArg = args.shift();

    const targetUser =
      message.mentions.users.first() ||
      (targetArg && (await client.users.fetch(targetArg).catch(() => null)));

    if (!targetUser) {
      return message.reply('Could not find that user. Use a mention or a valid user ID.');
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return message.reply('That user is not in this server.');
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply(
        'I need the **Timeout Members** (Moderate Members) permission to unmute users.',
      );
    }

    if (!member.isCommunicationDisabled()) {
      return message.reply('That user is not currently muted (timed out).');
    }

    try {
      await member.timeout(null, `Unmuted by ${message.author.tag}`);

      const embed = new EmbedBuilder()
        .setColor('#22c55e') // green
        .setTitle('User Unmuted')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          {
            name: 'User',
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: false,
          },
          {
            name: 'Unmuted by',
            value: `${message.author.tag} (${message.author.id})`,
            inline: false,
          },
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Unmute command error:', err);
      await message.reply('There was an error trying to unmute that user.');
    }
  },
};