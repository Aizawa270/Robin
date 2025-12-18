const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipedit',
  description: 'Shows last edited messages. Usage: $snipedit [1-15]',
  aliases: ['se'],
  category: 'utility',
  async execute(client, message, args) {
    if (!client.edits) return message.channel.send('Snipedit feature not enabled.');

    const edits = client.edits.get(message.channel.id);
    if (!edits || !edits.length) return message.channel.send('No edited messages in this channel.');

    const index = parseInt(args[0]) - 1 || 0;
    if (index < 0 || index >= edits.length) 
      return message.channel.send(`Please provide a valid index between 1 and ${edits.length}.`);

    const data = edits[index];

    const oldContent = data.oldContent?.length > 1024 ? data.oldContent.slice(0, 1021) + '...' : data.oldContent || '[No Text]';
    const newContent = data.newContent?.length > 1024 ? data.newContent.slice(0, 1021) + '...' : data.newContent || '[No Text]';

    const embed = new EmbedBuilder()
      .setColor('Yellow')
      .setAuthor({ name: data.author.tag, iconURL: data.author.displayAvatarURL({ dynamic: true }) })
      .setTitle('Edited Message')
      .addFields(
        { name: 'Before', value: oldContent },
        { name: 'After', value: newContent }
      )
      .setTimestamp(data.editedAt || data.createdAt);

    // Optional: include attachment if any
    if (data.attachments && data.attachments.size) {
      const attachment = data.attachments.first();
      if (attachment) embed.setImage(attachment.url);
    }

    message.channel.send({ embeds: [embed] });
  },
};