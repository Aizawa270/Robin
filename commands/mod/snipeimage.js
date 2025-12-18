const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipeimage',
  description: 'Shows recently deleted images or GIFs in this channel.',
  usage: '$snipeimage [number]',
  aliases: ['si'],
  category: 'utility',
  async execute(client, message, args) {
    if (!message.guild) return;

    const snipes = client.snipesImage?.get(message.channel.id) || [];
    if (!snipes.length) return message.channel.send('No deleted images or GIFs found.');

    let index = parseInt(args[0], 10) || 1;
    index = Math.max(1, Math.min(index, snipes.length)); // clamp to valid range

    const snipe = snipes[index - 1];
    if (!snipe || !snipe.attachments?.length) {
      return message.channel.send('No image/GIF found for that snipe.');
    }

    const description = snipe.content
      ? snipe.content.length > 4096
        ? snipe.content.slice(0, 4093) + '...'
        : snipe.content
      : 'No caption';

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setAuthor({
        name: snipe.author.tag,
        iconURL: snipe.author.displayAvatarURL({ dynamic: true }),
      })
      .setDescription(description)
      .setImage(snipe.attachments[0].url) // correct usage
      .setFooter({ text: `Snipe ${index} of ${snipes.length}` })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  },
};