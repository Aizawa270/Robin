const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipeimage',
  description: 'Shows recently deleted images or GIFs in this channel.',
  aliases: ['si'],
  category: 'utility',
  usage: '$snipeimage [1-15]',

  async execute(client, message, args) {
    if (!client.snipesImage) {
      return message.reply('SnipeImage feature is not enabled.');
    }

    const snipes = client.snipesImage.get(message.channel.id) || [];
    if (snipes.length === 0) {
      return message.reply('No deleted images or GIFs found in this channel.');
    }

    // Clamp index
    let index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) index = 1;
    if (index > snipes.length) index = snipes.length;

    const snipe = snipes[index - 1];

    if (!Array.isArray(snipe.attachments) || snipe.attachments.length === 0) {
      return message.reply('No image found at that index.');
    }

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setAuthor({
        name: snipe.author?.tag || 'Unknown User',
        iconURL: snipe.author?.displayAvatarURL({ dynamic: true }) || null,
      })
      .setDescription(snipe.content?.length ? snipe.content : '[No Caption]')
      .setImage(snipe.attachments[0])
      .setFooter({ text: `Snipe ${index} of ${snipes.length}` })
      .setTimestamp(snipe.createdAt || new Date());

    return message.channel.send({ embeds: [embed] });
  },
};