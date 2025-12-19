const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipe',
  description: 'Shows deleted messages. Usage: $snipe [1-15]',
  aliases: ['s'],
  category: 'utility',

  async execute(client, message, args) {
    // Safety check
    if (!client.snipes) {
      return message.reply('Snipe feature is not enabled.');
    }

    const snipes = client.snipes.get(message.channel.id) || [];
    if (snipes.length === 0) {
      return message.reply('No deleted messages found in this channel.');
    }

    // Clamp index between 1 and snipes.length
    let index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) index = 1;
    if (index > snipes.length) index = snipes.length;

    const data = snipes[index - 1];

    const embed = new EmbedBuilder()
      .setColor('Orange')
      .setAuthor({
        name: data.author?.tag || 'Unknown User',
        iconURL: data.author?.displayAvatarURL({ dynamic: true }) || null,
      })
      .setDescription(data.content?.length ? data.content : '[No Text Content]')
      .setFooter({ text: `Snipe ${index} of ${snipes.length}` })
      .setTimestamp(data.createdAt || new Date());

    // Attachments are stored as ARRAY OF URLS
    if (Array.isArray(data.attachments) && data.attachments.length > 0) {
      embed.setImage(data.attachments[0]);
    }

    return message.channel.send({ embeds: [embed] });
  },
};