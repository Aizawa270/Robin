const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipedit',
  description: 'Shows last edited messages. Usage: $snipedit [1-15]',
  aliases: ['se'],
  category: 'utility',

  async execute(client, message, args) {
    // Safety check
    if (!client.snipesEdit) {
      return message.reply('SnipEdit feature is not enabled.');
    }

    const edits = client.snipesEdit.get(message.channel.id) || [];
    if (edits.length === 0) {
      return message.reply('No edited messages found in this channel.');
    }

    // Clamp index between 1 and edits.length
    let index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) index = 1;
    if (index > edits.length) index = edits.length;

    const data = edits[index - 1];

    const oldContent = data.oldContent?.length ? data.oldContent.slice(0, 1021) + (data.oldContent.length > 1024 ? '...' : '') : '[No Text]';
    const newContent = data.newContent?.length ? data.newContent.slice(0, 1021) + (data.newContent.length > 1024 ? '...' : '') : '[No Text]';

    const embed = new EmbedBuilder()
      .setColor('Yellow')
      .setAuthor({
        name: data.author?.tag || 'Unknown User',
        iconURL: data.author?.displayAvatarURL({ dynamic: true }) || null,
      })
      .setTitle('Edited Message')
      .addFields(
        { name: 'Before', value: oldContent },
        { name: 'After', value: newContent }
      )
      .setFooter({ text: `SnipEdit ${index} of ${edits.length}` })
      .setTimestamp(data.createdAt || new Date());

    return message.channel.send({ embeds: [embed] });
  },
};