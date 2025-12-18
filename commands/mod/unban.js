const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'unban',
  description: 'Unban a user by ID.',
  category: 'mod',
  usage: '$unban <userID>',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Mods with Ban Members permission can unban
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('You need the **Ban Members** permission to use this command.');
    }

    const userId = args[0];
    if (!userId) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(colors.roleinfo || '#fde047')
            .setTitle('Unban Command Usage')
            .setDescription(
              '**Usage:**\n' +
              '`$unban <userID>`\n\n' +
              '**Example:**\n' +
              '`$unban 123456789012345678`'
            )
        ]
      });
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
          { name: 'User', value: `${banInfo.user.tag} (${banInfo.user.id})`, inline: false },
          { name: 'Unbanned by', value: `${message.author.tag} (${message.author.id})`, inline: false },
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Unban command error:', err);
      await message.reply('There was an error trying to unban that user.');
    }
  },
};