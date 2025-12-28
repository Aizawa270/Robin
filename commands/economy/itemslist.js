const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');

module.exports = {
  name: 'itemslist',
  aliases: ['itemlist', 'items'],
  category: 'economy',
  description: 'View all available items in the economy',

  async execute(client, message) {
    const allItems = items.listMasterItems();

    if (!allItems || allItems.length === 0) {
      return message.reply('No items found. Your item seed is broken.');
    }

    // group by rarity for readability
    const grouped = {};
    for (const item of allItems) {
      if (!grouped[item.rarity]) grouped[item.rarity] = [];
      grouped[item.rarity].push(item);
    }

    const embed = new EmbedBuilder()
      .setTitle('Economy Items')
      .setColor('#1f2937')
      .setFooter({ text: `Total items: ${allItems.length}` });

    for (const rarity of Object.keys(grouped)) {
      const value = grouped[rarity]
        .map(i => `• **${i.name}** (${i.slug}) — ${i.type}`)
        .join('\n')
        .slice(0, 1024); // discord safety

      embed.addFields({
        name: rarity.toUpperCase(),
        value
      });
    }

    return message.reply({ embeds: [embed] });
  }
};