// commands/economy/tradeaccept.js
const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'tradeaccept',
  aliases: [],
  category: 'economy',
  usage: '$tradeaccept <tradeId>',
  description: 'Accept a trade that was offered to you.',
  async execute(client, message, args) {
    const id = parseInt(args[0]);
    if (!id) return message.reply('Usage: $tradeaccept <tradeId>');
    const t = items.getPendingTrade(id);
    if (!t) return message.reply('Trade not found.');
    if (t.to_id !== message.author.id) return message.reply('This trade is not for you.');

    const offer = JSON.parse(t.offer_json);
    const request = JSON.parse(t.request_json);

    // verify the proposer still has the offered assets
    const proposer = t.from_id;
    const acceptor = t.to_id;

    // proposer coins & items check
    const propUser = econ.getUser(proposer);
    if ((offer.coins || 0) > (propUser.wallet || 0)) return message.reply('Proposer no longer has required coins. Trade cancelled.');
    for (const it of (offer.items||[])) {
      const have = items.getUserItemQty(proposer, it.item_id);
      if (have < it.qty) return message.reply('Proposer no longer has required items. Trade cancelled.');
    }

    // acceptor must have requested assets
    const accUser = econ.getUser(acceptor);
    if ((request.coins||0) > (accUser.wallet||0)) return message.reply('You do not have enough coins for this trade.');
    for (const it of (request.items||[])) {
      const have = items.getUserItemQty(acceptor, it.item_id);
      if (have < it.qty) return message.reply('You do not have the requested items.');
    }

    // --- perform transfers atomically (in JS order) ---
    // coins
    try {
      if (offer.coins && offer.coins > 0) { econ.addWallet(proposer, -offer.coins); econ.addWallet(acceptor, offer.coins); }
      if (request.coins && request.coins > 0) { econ.addWallet(acceptor, -request.coins); econ.addWallet(proposer, request.coins); }

      // items: move each offered item from proposer -> acceptor
      for (const it of (offer.items||[])) {
        items.removeItem(proposer, it.item_id, it.qty);
        items.giveItem(acceptor, it.item_id, it.qty);
      }
      // items: move each requested item from acceptor -> proposer
      for (const it of (request.items||[])) {
        items.removeItem(acceptor, it.item_id, it.qty);
        items.giveItem(proposer, it.item_id, it.qty);
      }
    } catch (err) {
      console.error('Trade execution error', err);
      return message.reply('Failed to execute trade. Check logs.');
    }

    // delete pending trade
    items.deleteTrade(id);

    const embed = new EmbedBuilder()
      .setTitle('Trade Completed')
      .setDescription(`Trade #${id} executed between <@${proposer}> and <@${acceptor}>`);

    return message.reply({ embeds: [embed] });
  }
};