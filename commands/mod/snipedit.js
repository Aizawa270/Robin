const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipedit',
  description: 'Shows last edited messages. Usage: $snipedit [1-15]',
  aliases: ['se'],
  category: 'utility',
  async execute(client, message, args) {
    const channelId = message.channel.id;
    const edits = client.edits.get(channelId);
    const index = Math.min(Math.max(parseInt(args[0] || '1') - 1, 0), 14);

    if (!edits || !edits[index]) return message.reply('No edited message found at that index.');

    const data = edits[index];
    const embed = new EmbedBuilder()
      .setColor('Yellow')
      .setAuthor({ name: data.author.tag, iconURL: data.author.displayAvatarURL({ dynamic: true }) })
      .setTitle('Edited Message')
      .addFields(
        { name: 'Before', value: data.oldContent || '[No Text]' },
        { name: 'After', value: data.newContent || '[No Text]' }
      )
      .setTimestamp(data.createdAt);

    message.reply({ embeds: [embed] });
  },
};