// commands/economy/itemslist.js
const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');

module.exports = {
  name: 'itemslist',
  description: 'Show all available items.',
  category: 'economy',
  usage: '!itemslist',
  async execute(client, message, args) {
    const allItems = items.listMasterItems();

    if (!allItems.length) return message.reply('No items found.');

    const embed = new EmbedBuilder()
      .setTitle('🛠 Items List')
      .setColor('#0ea5e9');

    for (const it of allItems) {
      embed.addFields({
        name: `${it.name} [${it.rarity}]`,
        value: `Type: ${it.type}\nSlug: \`${it.slug}\`\nDesc: ${it.description}`,
      });
    }

    return message.reply({ embeds: [embed] });
  },
};