const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipeimage',
  description: 'Shows recently deleted images or GIFs in this channel.',
  aliases: ['si'],
  category: 'utility',
  usage: '$snipeimage [1-15]',
  async execute(client, message, args) {
    if (!message.guild) return;

    const snipes = client.snipesImage?.get(message.channel.id) || [];
    if (!snipes.length) return message.reply('No deleted images or GIFs found.');

    const index = Math.min(Math.max(parseInt(args[0]) - 1 || 0, 0), snipes.length - 1);
    const snipe = snipes[index];

    if (!snipe) return message.reply('No image found at that index.');

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setAuthor({
        name: snipe.author.tag,
        iconURL: snipe.author.displayAvatarURL({ dynamic: true }),
      })
      .setDescription(snipe.content || '[No Caption]')
      .setTimestamp()
      .setFooter({ text: `Snipe ${index + 1} of ${snipes.length}` });

    if (snipe.attachments && snipe.attachments.length) embed.setImage(snipe.attachments[0]);

    message.channel.send({ embeds: [embed] });
  },
};