const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'snipereaction',
  aliases: ['sr'],
  description: 'Shows recently added reactions.',
  category: 'mod',
  hidden: true,

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply(
        'You need the **Manage Messages** permission to use this command.'
      );
    }

    const snipes =
      client.reactionSnipes?.get(message.channel.id) || [];

    if (!snipes.length) {
      return message.reply('No cache history has been found.');
    }

    let index = parseInt(args[0], 10);

    if (isNaN(index) || index < 1) {
      index = 1;
    }

    if (index > snipes.length) {
      index = snipes.length;
    }

    const data = snipes[index - 1];

    const embed = new EmbedBuilder()
      .setColor('#f472b6')
      .setAuthor({
        name: data.user?.tag || 'Unknown User',
        iconURL:
          data.user?.displayAvatarURL?.({ dynamic: true }) || undefined,
      })
      .setDescription(`Reacted with ${data.emoji || 'Unknown Emoji'}`)
      .setFooter({
        text: `Reaction snipe ${index} of ${snipes.length}`,
      })
      .setTimestamp(data.createdAt || Date.now());

    return message.reply({
      embeds: [embed],
    });
  },
};