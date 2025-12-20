const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'unmute',
  description: 'Remove timeout from a user.',
  category: 'mod',
  usage: '$unmute <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('Server only.');

    const memberPerms = message.member.permissions;
    const canModerate =
      memberPerms.has(PermissionFlagsBits.ModerateMembers) ||
      memberPerms.has(PermissionFlagsBits.Administrator);

    if (!canModerate) return message.reply('You need **Timeout Members** permission or admin.');

    if (!args.length) {
      const usageEmbed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('Unmute Command Usage')
        .setDescription(
          '**Usage:**\n' +
          '`$unmute <@user|userID> [reason]`\n\n' +
          '**Examples:**\n' +
          '`$unmute @User spamming ended`\n' +
          '`$unmute 123456789012345678 apology`\n'
        );
      return message.reply({ embeds: [usageEmbed] });
    }

    const targetArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not in this server.');

    if (member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('Cannot unmute an administrator.');

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('I need **Timeout Members** permission.');

    if (!member.communicationDisabledUntil) return message.reply('This user is not muted.');

    try {
      await member.timeout(null, `${reason} (unmuted by ${message.author.tag})`);

      // 🔹 Fake pings
      const fakeUserPing = `<@${targetUser.id}>`;
      const fakeModPing = `<@${message.author.id}>`;

      const embed = new EmbedBuilder()
        .setColor('#22c55e') // green for unmute
        .setTitle('User Unmuted')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: fakeUserPing, inline: false },
          { name: 'Unmuted by', value: fakeModPing, inline: false },
          { name: 'Reason', value: reason, inline: false },
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Unmute command error:', err);
      await message.reply('Failed to unmute the user.');
    }
  },
};