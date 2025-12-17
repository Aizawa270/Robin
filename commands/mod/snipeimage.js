const { EmbedBuilder } = require('discord.js');

const MAX_SNIPES = 15;

module.exports = {
  name: 'snipeimage',
  description: 'Shows recently deleted images or GIFs in this channel.',
  category: 'utility',
  usage: '$snipeimage [number]',
  aliases: ['si'],
  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.snipesImage) client.snipesImage = new Map(); // channelId -> array of deleted msgs

    const snipes = client.snipesImage.get(message.channel.id) || [];
    if (!snipes.length) return message.reply('No deleted images or GIFs found.');

    // Default to latest snipe
    let index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) index = 1;
    if (index > snipes.length) index = snipes.length;

    const snipe = snipes[index - 1]; // arrays are 0-indexed

    if (!snipe || !snipe.attachments.length) {
      return message.reply('No image/GIF found for that snipe.');
    }

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setAuthor({
        name: `${snipe.author.tag}`,
        iconURL: snipe.author.displayAvatarURL({ dynamic: true }),
      })
      .setDescription(snipe.content || 'No caption')
      .setImage(snipe.attachments[0]) // show first attachment
      .setFooter({ text: `Snipe ${index} of ${snipes.length}` })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};