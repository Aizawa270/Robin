const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'unban',
  description: 'Unban a user by ID.',
  category: 'mod',
  usage: '$unban <userID>',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command can only be used in a server.');

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('You need the **Ban Members** permission to use this command.');
    }

    const userId = args[0];
    if (!userId) {
      // Get dynamic prefix
      const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';
      
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#fde047')
            .setTitle('Unban Command Usage')
            .setDescription(
              '**Usage:**\n' +
              `\`${prefix}unban <userID>\`\n\n` +
              '**Example:**\n' +
              `\`${prefix}unban 123456789012345678\``
            )
        ]
      });
    }

    try {
      const banInfo = await message.guild.bans.fetch(userId).catch(() => null);
      if (!banInfo) return message.reply('That user is not banned or the ID is invalid.');

      await message.guild.bans.remove(userId, `Unbanned by ${message.author.tag}`);

      // 🔹 Log to modstats - WITH PROPER CLIENT PARAMETER
      const logSuccess = logModAction(
        client,
        message.guild.id,
        message.author.id,
        userId,
        'unban',
        'Unbanned by moderator'
      );

      if (!logSuccess) {
        console.error('[Unban] Failed to log to modstats');
      }

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('User Unbanned')
        .addFields(
          { name: 'User', value: `<@${banInfo.user.id}>`, inline: false },
          { name: 'Unbanned by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Original Ban Reason', value: banInfo.reason || 'No reason provided', inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Unban command error:', err);
      await message.reply('There was an error trying to unban that user.');
    }
  },
};