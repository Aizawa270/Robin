'use strict';

const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const { getItemById, money, getPurchaseCooldown, setPurchaseCooldown } = require('../../handlers/shopSystem');
const pokemon = require('../../handlers/pokemonService');

const LABELS = { common: 'Common Pokémon Pack', rare: 'Rare Pokémon Pack', mythical: 'Mythical Pokémon Pack' };

function makeEmbed(title, description, color = '#FF69B4') {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}

module.exports = {
  name: 'ecbuy',
  aliases: [],
  description: 'Purchase a Pokémon pack from the Economy Shop.',
  category: 'economy',
  usage: '$ecbuy <EC shop item ID>',

  async execute(client, message, args) {
    if (!message.guild) return;
    if (!client.economy) return message.reply('Economy is not initialized.');

    const rawId = String(args[0] || '').trim();
    if (!rawId) return message.reply('Use: `$ecbuy <EC shop item ID>`.');
    const item = getItemById('ec', message.guild.id, rawId);
    if (!item) {
      return message.reply({ embeds: [makeEmbed('EC Shop Item Not Found', `There is no Economy Shop item with ID **${rawId}**.`, 0xED4245)] });
    }

    const mapping = pokemon.getShopProduct(message.guild.id, item.item_id);
    if (!mapping) {
      return message.reply({ embeds: [makeEmbed('Not a Pokémon Pack', 'This EC shop item is not registered as a Pokémon pack. Ask a server manager to configure a Pokémon pack product.', 0xED4245)] });
    }

    const now = Date.now();
    const cooldownMs = Number(item.cooldown_ms || 0);
    const lastBought = Number(getPurchaseCooldown('ec', message.guild.id, message.author.id, item.item_id) || 0);
    if (cooldownMs > 0 && lastBought && now - lastBought < cooldownMs) {
      return message.reply({ embeds: [makeEmbed('Purchase Cooldown', `You can buy **${LABELS[mapping.pack_type]}** again in **${Math.ceil((cooldownMs - (now - lastBought)) / 1000)} seconds**.`, 0xED4245)] });
    }

    const price = Number(item.price || 0);
    const balance = Number(client.economy.getBalance(message.guild.id, message.author.id) || 0);
    if (balance < price) {
      return message.reply({ embeds: [makeEmbed('Insufficient Crowns', `You need **${money(client, price)}** to buy **${LABELS[mapping.pack_type]}**.\n\nYour balance: **${money(client, balance)}**\nYou're short by: **${money(client, price - balance)}**`, 0xED4245)] });
    }

    const removed = client.economy.removeCrowns(message.guild.id, message.author.id, price, {
      type: 'pokemon_ec_shop_purchase',
      reason: `Bought ${LABELS[mapping.pack_type]}`,
      actorId: message.author.id,
      timestamp: now,
    });
    if (!removed) {
      return message.reply({ embeds: [makeEmbed('Purchase Failed', 'Your Crowns balance changed before the purchase could complete. Please try again.', 0xED4245)] });
    }

    const purchaseId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    let credit;
    try {
      credit = pokemon.creditShopPurchase({
        purchaseId,
        guildId: message.guild.id,
        userId: message.author.id,
        itemId: item.item_id,
        packType: mapping.pack_type,
        amount: 1,
        now,
      });
      if (!credit.ok) throw new Error(`Pack credit failed: ${credit.code}`);
    } catch (error) {
      console.error('[Pokémon EC Shop] Pack credit failed; refunding Crowns:', error);
      client.economy.addCrowns(message.guild.id, message.author.id, price, {
        type: 'pokemon_ec_shop_refund',
        reason: 'Pokémon pack delivery failed',
        actorId: message.author.id,
      });
      return message.reply({ embeds: [makeEmbed('Purchase Refunded', 'The pack could not be delivered, so your Crowns were refunded. Please try again later.', 0xED4245)] });
    }

    // Pack credit has succeeded. If writing the cooldown fails, the user still
    // keeps the delivered pack; a temporary missing cooldown is safer than a loss.
    try { setPurchaseCooldown('ec', message.guild.id, message.author.id, item.item_id, now); }
    catch (error) { console.error('[Pokémon EC Shop] Could not save purchase cooldown:', error); }

    const balanceAfter = client.economy.getBalance(message.guild.id, message.author.id);
    const packCount = credit.balances[mapping.pack_type];
    return message.reply({ embeds: [makeEmbed('Pokémon Pack Purchased!', `You purchased **${LABELS[mapping.pack_type]}** for **${money(client, price)}**.\n\nYour ${mapping.pack_type} pack balance: **${packCount}**\nRemaining Crowns: **${money(client, balanceAfter)}**\n\nOpen it with \`$p pack ${mapping.pack_type}\`.`)] });
  },
};
