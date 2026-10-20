const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'cs',
  description: 'Clears all snipe cache history.',
  category: 'mod',

  async execute(client, message) {
    if (!message.guild) return;

    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription(
              'You need the **Manage Messages** permission to use this command.'
            ),
        ],
      });
    }

    // Clear deleted-message cache
    if (client.snipes?.has(message.channel.id)) {
      client.snipes.delete(message.channel.id);
    }

    // Clear edited-message cache
    if (client.edits?.has(message.channel.id)) {
      client.edits.delete(message.channel.id);
    }

    // Clear reaction cache
    if (client.reactionSnipes?.has(message.channel.id)) {
      client.reactionSnipes.delete(message.channel.id);
    }

    return message.reply('Cache history has been wiped.');
  },
};