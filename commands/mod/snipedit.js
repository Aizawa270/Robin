const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipedit',
  aliases: ['se'],
  async execute(client, message, args) {
    const edits = client.edits.get(message.channel.id);
    if (!edits || edits.length === 0) return message.reply('Nothing edited recently!');

    const index = Math.min(Math.max(parseInt(args[0] || '1', 10) - 1, 0), edits.length - 1);
    const edit = edits[index];

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setAuthor({ name: edit.author, iconURL: edit.avatar })
      .addFields(
        { name: 'Before', value: edit.oldContent || '*(empty)*' },
        { name: 'After', value: edit.newContent || '*(empty)*' }
      )
      .setFooter({ text: `Edited message (#${index + 1})` })
      .setTimestamp(edit.timestamp);

    message.channel.send({ embeds: [embed] });
  },
};