const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipe',
  aliases: ['s'],
  async execute(client, message, args) {
    const snipes = client.snipes.get(message.channel.id);
    if (!snipes || snipes.length === 0) return message.reply('Nothing to snipe!');

    const index = Math.min(Math.max(parseInt(args[0] || '1', 10) - 1, 0), snipes.length - 1);
    const snipe = snipes[index];

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: snipe.author, iconURL: snipe.avatar })
      .setDescription(snipe.content || '*(empty)*')
      .setFooter({ text: `Deleted message (#${index + 1})` })
      .setTimestamp(snipe.timestamp);

    message.channel.send({ embeds: [embed] });
  },
};