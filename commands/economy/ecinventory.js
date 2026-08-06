const { EmbedBuilder } = require('discord.js');

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  return embed;
}

module.exports = {
  name: 'ecinventory',
  aliases: ['ecinv'],
  description: 'Show economy inventory.',
  category: 'economy',
  usage: '$ecinventory',

  async execute(client, message) {
    if (!message.guild) return;

    const embed = buildEmbed(message, {
      title: `${message.author.username}'s Economy Inventory`,
      description: 'Nothing here yet. This will be used once jobs and work items are added.',
      thumbnail: message.author.displayAvatarURL({ size: 256 }),
    });

    return message.reply({ embeds: [embed] });
  },
};