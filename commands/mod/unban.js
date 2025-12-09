const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'unban',
  description: 'Unban a user by ID or tag.',
  category: 'mod',
  usage: '$unban <userID>',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Admin-only
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Only admins can use this command.');
    }

    const userId = args[0];
    if (!userId) {
      return message.reply('Please provide a user ID. Example: `$unban 123456789012345678`');
    }

    try {
      const banInfo = await message.guild.bans.fetch(userId).catch(() => null);
      if (!banInfo) {
        return message.reply('That user is not banned or the ID is invalid.');
      }

      await message.guild.bans.remove(userId, `Unbanned by ${message.author.tag}`);

      const embed = new EmbedBuilder()
        .setColor('#22c55e') // green for unban
        .setTitle('User Unbanned')
        .addFields(
          {
            name: 'User',
            value: `${banInfo.user.tag} (${banInfo.user.id})`,
            inline: false,
          },
          {
            name: 'Unbanned by',
            value: `${message.author.tag} (${message.author.id})`,
            inline: false,
          },
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Unban command error:', err);
      await message.reply('There was an error trying to unban that user.');
    }
  },
};