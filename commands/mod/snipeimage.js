const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipeimage',
  description: 'Shows the last deleted image or GIF. Usage: $snipeimage [1-15]',
  aliases: ['si'],
  category: 'utility',
  usage: '$snipeimage [1-15]',
  async execute(client, message, args) {
    const channelId = message.channel.id;
    const snipes = client.snipes.get(channelId);

    if (!snipes || !snipes.length) return message.reply('No deleted images found in this channel.');

    const index = Math.min(Math.max(parseInt(args[0] || '1') - 1, 0), 14); // 1-15 index
    const data = snipes[index];

    if (!data) return message.reply('No deleted image at that index.');

    // Filter for image/gif attachments only
    const imageAttachment = data.attachments.find((url) =>
      url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg') || url.endsWith('.gif') || url.endsWith('.webp')
    );

    if (!imageAttachment) return message.reply('No images or GIFs found in that deleted message.');

    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setAuthor({ name: data.author.tag, iconURL: data.author.displayAvatarURL({ dynamic: true }) })
      .setTitle('Deleted Image/GIF')
      .setImage(imageAttachment)
      .setTimestamp(data.createdAt);

    await message.reply({ embeds: [embed] });
  },
};