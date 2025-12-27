// commands/economy/tradereject.js
const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');

module.exports = {
  name: 'tradereject',
  aliases: ['tradedecline'],
  category: 'economy',
  usage: '$tradereject <tradeId>',
  description: 'Reject a pending trade.',
  async execute(client, message, args) {
    const id = parseInt(args[0]);
    if (!id) return message.reply('Usage: $tradereject <tradeId>');
    const t = items.getPendingTrade(id);
    if (!t) return message.reply('Trade not found.');
    if (t.to_id !== message.author.id && t.from_id !== message.author.id) return message.reply('You are not part of this trade.');

    items.deleteTrade(id);
    return message.reply({ embeds: [ new (require('discord.js').EmbedBuilder)().setDescription(`Trade #${id} cancelled.`) ] });
  }
};