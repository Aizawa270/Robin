const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipeimage',
  description: 'Shows the last deleted image or GIF. Usage: $snipeimage [1-15]',
  aliases: ['si'],
  category: 'utility',
  async execute(client, message, args) {
    const channelId = message.channel.id;
    const snipes = client.snipes.get(channelId);

    if (!snipes || !snipes.length) return message.reply('No deleted images found in this channel.');

    const index = Math.min(Math.max(parseInt(args[0] || '1') - 1, 0), 14); // 1-15 index
    const data = snipes[index];

    if (!data) return message.reply('No deleted image at that index.');

    const firstAttachment = data.attachments.find(a => a);
    if (!firstAttachment) return message.reply('No attachments found in that deleted message.');

    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setAuthor({ name: data.author.tag, iconURL: data.author.displayAvatarURL({ dynamic: true }) })
      .setTitle('Deleted Image/GIF')
      .setImage(firstAttachment)
      .setTimestamp(data.createdAt);

    await message.reply({ embeds: [embed] });
  },
};