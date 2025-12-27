const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'useitem',
  description: 'Use an item from your inventory',
  category: 'economy',
  usage: '!useitem <item_slug>',
  async execute(client, message, args) {
    if (!args[0]) return message.reply('Please provide an item slug to use.');

    const slug = args[0].toLowerCase();
    const item = items.getMasterItem(slug);
    if (!item) return message.reply('Item not found.');

    const qty = items.getUserItemQty(message.author.id, item.id);
    if (!qty) return message.reply('You do not have this item.');

    // Check faction restriction
    const user = econ.getUser(message.author.id);
    if (item.data?.factionOnly && !user.faction_id) {
      return message.reply('This item can only be used by a faction member.');
    }

    // remove item
    items.removeItem(message.author.id, item.id, 1);

    // apply effect in memory
    const data = item.data || {};
    require('../../handlers/items').applyItemEffect(message.author.id, data);

    // effect text
    let effectText = '';
    if (data.jobBoost) effectText += `Job earnings boosted by ${data.jobBoost}% for next job.\n`;
    if (data.eventBoost) effectText += `Event rewards boosted by ${data.eventBoost}%.\n`;
    if (data.factionBoost) effectText += `Faction earnings boosted by ${data.factionBoost}%.\n`;
    if (data.risk) effectText += `Risk modifier applied: ${data.risk}%.\n`;

    const embed = new EmbedBuilder()
      .setTitle(`Used Item: ${item.name}`)
      .setColor('#f97316')
      .setDescription(effectText || 'Used the item, but nothing happened.');

    return message.reply({ embeds: [embed] });
  }
};