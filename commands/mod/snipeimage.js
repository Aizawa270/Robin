const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipeimage',
  aliases: ['si'],
  async execute(client, message, args) {
    const snipes = client.imageSnipes.get(message.channel.id);
    if (!snipes || snipes.length === 0) return message.reply('No deleted images or GIFs!');

    const index = Math.min(Math.max(parseInt(args[0] || '1', 10) - 1, 0), snipes.length - 1);
    const snipe = snipes[index];

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setAuthor({ name: snipe.author, iconURL: snipe.avatar })
      .setImage(snipe.imageURL)
      .setFooter({ text: `Deleted image (#${index + 1})` })
      .setTimestamp(snipe.timestamp);

    message.channel.send({ embeds: [embed] });
  },
};