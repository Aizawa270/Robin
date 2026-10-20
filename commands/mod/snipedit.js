const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'snipedit',
  description: 'Shows last edited messages. Usage: !snipedit [1-15]',
  aliases: ['se'],
  category: 'mod',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply(
        'You need the **Manage Messages** permission to use this command.'
      );
    }

    const edits = client.edits?.get(message.channel.id) || [];

    if (!edits.length) {
      return message.reply('No cache history has been found.');
    }

    let index = parseInt(args[0], 10);

    if (isNaN(index) || index < 1) {
      index = 1;
    }

    if (index > edits.length) {
      index = edits.length;
    }

    const data = edits[index - 1];

    const embed = new EmbedBuilder()
      .setColor('Yellow')
      .setAuthor({
        name: data.author?.tag || 'Unknown User',
        iconURL:
          data.author?.displayAvatarURL?.({ dynamic: true }) || undefined,
      })
      .setTitle('Edited Message')
      .addFields(
        {
          name: 'Before',
          value: data.oldContent || '[No Text]',
        },
        {
          name: 'After',
          value: data.newContent || '[No Text]',
        }
      )
      .setFooter({
        text: `SnipEdit ${index} of ${edits.length}`,
      })
      .setTimestamp(data.createdAt || Date.now());

    return message.reply({
      embeds: [embed],
    });
  },
};