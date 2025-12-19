const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipedit',
  description: 'Shows last edited messages. Usage: $snipedit [1-15]',
  aliases: ['se'],
  category: 'utility',

  async execute(client, message, args) {
    const edits = client.edits.get(message.channel.id) || [];
    if (!edits.length) return message.reply('No edited messages found in this channel.');

    let index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) index = 1;
    if (index > edits.length) index = edits.length;

    const data = edits[index - 1];
    const embed = new EmbedBuilder()
      .setColor('Yellow')
      .setAuthor({ name: data.author.tag, iconURL: data.author.displayAvatarURL({ dynamic: true }) })
      .setTitle('Edited Message')
      .addFields(
        { name: 'Before', value: data.oldContent || '[No Text]' },
        { name: 'After', value: data.newContent || '[No Text]' }
      )
      .setFooter({ text: `SnipEdit ${index} of ${edits.length}` })
      .setTimestamp(data.createdAt);

    return message.reply({ embeds: [embed] });
  },
};