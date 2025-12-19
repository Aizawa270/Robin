const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipe',
  description: 'Shows deleted messages. Usage: $snipe [1-15]',
  aliases: ['s'],
  category: 'utility',

  async execute(client, message, args) {
    const snipes = client.snipes.get(message.channel.id) || [];
    if (!snipes.length) return message.reply('No deleted messages found in this channel.');

    let index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) index = 1;
    if (index > snipes.length) index = snipes.length;

    const data = snipes[index - 1];
    const embed = new EmbedBuilder()
      .setColor('Orange')
      .setAuthor({ name: data.author.tag, iconURL: data.author.displayAvatarURL({ dynamic: true }) })
      .setDescription(data.content || '[No Text Content]')
      .setFooter({ text: `Snipe ${index} of ${snipes.length}` })
      .setTimestamp(data.createdAt);

    if (data.attachments.length) embed.setImage(data.attachments[0]);
    return message.reply({ embeds: [embed] });
  },
};