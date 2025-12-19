const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipedit',
  description: 'Shows last edited messages. Usage: $snipedit [1-15]',
  aliases: ['se'],
  category: 'utility',
  async execute(client, message, args) {
    // ✅ correct map name
    if (!client.snipesEdit) {
      return message.reply('SnipEdit feature is not enabled.');
    }

    const edits = client.snipesEdit.get(message.channel.id);
    if (!edits || !edits.length) {
      return message.reply('No edited messages in this channel.');
    }

    let index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) index = 1;
    if (index > edits.length) index = edits.length;

    const data = edits[index - 1];

    const oldContent = data.oldContent
      ? data.oldContent.slice(0, 1021) + (data.oldContent.length > 1024 ? '...' : '')
      : '[No Text]';

    const newContent = data.newContent
      ? data.newContent.slice(0, 1021) + (data.newContent.length > 1024 ? '...' : '')
      : '[No Text]';

    const embed = new EmbedBuilder()
      .setColor('Yellow')
      .setAuthor({
        name: data.author.tag,
        iconURL: data.author.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('Edited Message')
      .addFields(
        { name: 'Before', value: oldContent },
        { name: 'After', value: newContent }
      )
      .setFooter({ text: `SnipEdit ${index} of ${edits.length}` })
      .setTimestamp(data.createdAt);

    await message.reply({ embeds: [embed] });
  },
};