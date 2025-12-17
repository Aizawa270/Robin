const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipedit',
  description: 'Shows last edited messages. Usage: $snipedit [1-15]',
  aliases: ['se'],
  category: 'utility',
  async execute(client, message, args) {
    const channelId = message.channel.id;
    const edits = client.edits?.get(channelId);

    if (!edits || edits.length === 0) {
      return message.reply('No edited messages in this channel.');
    }

    const index = Math.min(Math.max(parseInt(args[0] || '1', 10) - 1, 0), edits.length - 1);
    const data = edits[index];

    if (!data) return message.reply('No edited message found at that index.');

    // Truncate long content to 1024 chars to avoid Discord embed errors
    const oldContent = data.oldContent?.slice(0, 1021) + (data.oldContent?.length > 1024 ? '...' : '');
    const newContent = data.newContent?.slice(0, 1021) + (data.newContent?.length > 1024 ? '...' : '');

    const embed = new EmbedBuilder()
      .setColor('Yellow')
      .setAuthor({ name: data.author.tag, iconURL: data.author.displayAvatarURL({ dynamic: true }) })
      .setTitle('Edited Message')
      .addFields(
        { name: 'Before', value: oldContent || '[No Text]' },
        { name: 'After', value: newContent || '[No Text]' }
      )
      .setTimestamp(data.createdAt);

    await message.reply({ embeds: [embed] });
  },
};