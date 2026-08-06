const { EmbedBuilder } = require('discord.js');
const { listShopItems, money } = require('../../handlers/shopSystem');

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  return embed;
}

module.exports = {
  name: 'ecshop',
  aliases: [],
  description: 'Economy shop.',
  category: 'economy',
  usage: '$ecshop',

  async execute(client, message) {
    if (!message.guild) return;

    const items = listShopItems('ec', message.guild.id);

    const embed = buildEmbed(message, {
      title: 'Economy Shop',
      description: items.length
        ? items.map(item => `**${item.item_id}** • ${item.name}\nPrice: ${money(client, item.price)}`).join('\n\n')
        : 'No economy shop items yet.',
      thumbnail: message.guild.iconURL({ size: 256 }),
    });

    return message.reply({ embeds: [embed] });
  },
};