const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');

module.exports = {
  name: 'itemslist',
  description: 'List all items',
  category: 'economy',
  async execute(client, message, args) {
    const allItems = items.listMasterItems();
    const embed = new EmbedBuilder()
      .setTitle('🛠️ Items List')
      .setColor('#22c55e');

    for (const item of allItems) {
      embed.addFields({
        name: `${item.name} [${item.rarity}]`,
        value: `${item.description}${item.data?.factionOnly ? '\nFaction Exclusive' : ''}\nType: ${item.type}`,
      });
    }

    return message.reply({ embeds: [embed] });
  }
};