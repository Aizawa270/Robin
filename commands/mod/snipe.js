const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipe',
  description: 'Shows deleted messages. Usage: $snipe [1-15]',
  aliases: ['s'],
  category: 'utility',
  async execute(client, message, args) {
    const channelId = message.channel.id;
    const snipes = client.snipes.get(channelId);
    const index = Math.min(Math.max(parseInt(args[0] || '1') - 1, 0), 14);

    if (!snipes || !snipes[index]) return message.reply('No deleted message found at that index.');

    const data = snipes[index];
    const embed = new EmbedBuilder()
      .setColor('Orange')
      .setAuthor({ name: data.author.tag, iconURL: data.author.displayAvatarURL({ dynamic: true }) })
      .setDescription(data.content || '[No Text Content]')
      .setTimestamp(data.createdAt);

    if (data.attachments.length) embed.setImage(data.attachments[0]);
    message.reply({ embeds: [embed] });
  },
};