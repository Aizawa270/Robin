const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipereaction',
  aliases: ['sr'],
  description: 'Shows recently added reactions.',
  category: 'utility',
  hidden: true,

  async execute(client, message, args) {
    const snipes = client.reactionSnipes.get(message.channel.id) || [];
    if (!snipes.length) {
      return message.reply('No reaction snipes in this channel.');
    }

    let index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) index = 1;
    if (index > snipes.length) index = snipes.length;

    const data = snipes[index - 1];

    const embed = new EmbedBuilder()
      .setColor('#f472b6')
      .setAuthor({
        name: data.user.tag,
        iconURL: data.user.displayAvatarURL({ dynamic: true })
      })
      .setDescription(`Reacted with ${data.emoji}`)
      .setFooter({ text: `Reaction snipe ${index} of ${snipes.length}` })
      .setTimestamp(data.createdAt);

    return message.reply({ embeds: [embed] });
  },
};