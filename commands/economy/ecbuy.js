const { EmbedBuilder } = require('discord.js');
const { buyItem, listShopItems, money } = require('../../handlers/shopSystem');

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  return embed;
}

module.exports = {
  name: 'ecbuy',
  aliases: [],
  description: 'Buy from the economy shop.',
  category: 'economy',
  usage: '$ecbuy <item id>',

  async execute(client, message, args) {
    if (!message.guild) return;
    if (!client.economy) return message.reply('Economy is not initialized.');

    const itemId = String(args[0] || '').padStart(2, '0');
    if (!itemId.trim()) return message.reply('Use: `$ecbuy <item id>`');

    const item = listShopItems('ec', message.guild.id).find(i => String(i.item_id) === itemId);
    if (!item) {
      return message.reply('No economy shop items exist yet.');
    }

    const result = await buyItem('ec', client, message.guild, message.author, itemId);
    if (!result.ok) {
      if (result.reason === 'cooldown') {
        return message.reply(`That item is on cooldown for **${Math.ceil(result.remaining / 1000)}s**.`);
      }
      return message.reply('You could not buy that item.');
    }

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Purchase Complete',
          description: `You bought **${result.item.name}** for **${money(client, result.item.price)}**.`,
          thumbnail: message.guild.iconURL({ size: 256 }),
        }),
      ],
    });
  },
};