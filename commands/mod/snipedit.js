const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipedit',
  description: 'Shows last edited messages. Usage: $snipedit [1-15]',
  aliases: ['se'],
  category: 'utility',
  async execute(client, message, args) {
    if (!client.edits) return message.reply('SnipEdit feature is not enabled.');

    const edits = client.edits.get(message.channel.id) || [];
    if (!edits.length) return message.reply('No edited messages in this channel.');

    const index = Math.min(Math.max(parseInt(args[0]) - 1 || 0, 0), edits.length - 1);
    const data = edits[index];

    const oldContent = data.oldContent?.slice(0, 1021) + (data.oldContent?.length > 1024 ? '...' : '');
    const newContent = data.newContent?.slice(0, 1021) + (data.newContent?.length > 1024 ? '...' : '');

    const embed = new EmbedBuilder()
      .setColor('Yellow')
      .setAuthor({
        name: data.author.tag,
        iconURL: data.author.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('Edited Message')
      .addFields(
        { name: 'Before', value: oldContent || '[No Text]' },
        { name: 'After', value: newContent || '[No Text]' }
      )
      .setTimestamp(data.createdAt);

    message.channel.send({ embeds: [embed] });
  },
};