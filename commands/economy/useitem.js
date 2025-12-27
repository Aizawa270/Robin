// commands/economy/useitem.js
const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'useitem',
  description: 'Use a consumable item from your inventory.',
  category: 'economy',
  usage: '!useitem <item-slug>',
  async execute(client, message, args) {
    const slug = args[0]?.toLowerCase();
    if (!slug) return message.reply('Specify an item slug to use.');

    const masterItem = items.getMasterItem(slug);
    if (!masterItem) return message.reply('Item not found.');

    const qty = items.getUserItemQty(message.author.id, masterItem.id);
    if (!qty) return message.reply('You do not own this item.');

    if (masterItem.type !== 'consumable') return message.reply('This item is not consumable.');

    // Apply item effects (basic examples, expand later)
    const data = masterItem.data || {};
    let effectMsg = '';

    if (data.jobBoostPct) {
      effectMsg += `💼 Job payout increased by ${data.jobBoostPct*100}% for next use.\n`;
      // Could store in economy cooldowns or temp boosts
    }

    if (data.xpBoostPct) {
      effectMsg += `⭐ Job XP increased by ${data.xpBoostPct*100}% for next use.\n`;
    }

    if (data.dailyBonus) {
      econ.addWallet(message.author.id, data.dailyBonus);
      effectMsg += `💰 You gained ${data.dailyBonus} Vyncoins instantly!\n`;
    }

    if (!effectMsg) effectMsg = 'Item used, but no immediate effect implemented yet.';

    // Remove one from inventory
    items.removeItem(message.author.id, masterItem.id, 1);

    const embed = new EmbedBuilder()
      .setTitle(`Used ${masterItem.name}`)
      .setDescription(effectMsg)
      .setColor('#0ea5e9');

    return message.reply({ embeds: [embed] });
  },
};