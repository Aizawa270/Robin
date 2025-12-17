const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipeimage',
  description: 'Shows the last deleted image/GIF. Usage: $snipeimage [1-15]',
  aliases: ['si'],
  category: 'utility',
  async execute(client, message, args) {
    const channelId = message.channel.id;
    const snipes = client.snipes.get(channelId);
    const index = Math.min(Math.max(parseInt(args[0] || '1') - 1, 0), 14);

    if (!snipes || !snipes[index]) return message.reply('No deleted image found at that index.');
    const data = snipes[index];
    if (!data.attachments.length) return message.reply('No attachments found in that deleted message.');

    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setAuthor({ name: data.author.tag, iconURL: data.author.displayAvatarURL({ dynamic: true }) })
      .setTitle('Deleted Image/GIF')
      .setImage(data.attachments[0])
      .setTimestamp(data.createdAt);

    message.reply({ embeds: [embed] });
  },
};