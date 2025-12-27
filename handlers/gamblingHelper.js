// handlers/gamblingHelper.js
const { EmbedBuilder } = require('discord.js');

const MAX_BET = 100_000;
const MIN_BET = 1;

function badSetupReply(channel, text = 'Economy handler not found. Wire client.economy with getWallet/addWallet/removeWallet/addMonthlyProgress.') {
  return channel.send({ embeds: [new EmbedBuilder().setColor('#f87171').setDescription(text)] });
}

async function getWallet(client, userId) {
  if (!client.economy || typeof client.economy.getWallet !== 'function') return null;
  return await client.economy.getWallet(userId);
}

async function changeWallet(client, userId, amount) {
  // amount may be negative (remove) or positive (add)
  if (!client.economy) return null;
  if (amount >= 0 && typeof client.economy.addWallet === 'function') {
    return await client.economy.addWallet(userId, amount);
  }
  if (amount < 0 && typeof client.economy.removeWallet === 'function') {
    return await client.economy.removeWallet(userId, -amount);
  }
  return null;
}

async function addMonthlyGamblingProgress(client, userId, amount) {
  // If your economy has a dedicated method to record monthly gambling progress, use it.
  if (client.economy && typeof client.economy.addMonthlyProgress === 'function') {
    try {
      await client.economy.addMonthlyProgress(userId, amount, 'gamble');
    } catch (e) { /* ignore */ }
  }
}

function validateBet(amount) {
  if (!Number.isFinite(amount)) return { ok: false, reason: 'Invalid number' };
  amount = Math.floor(amount);
  if (amount < MIN_BET) return { ok: false, reason: `Minimum bet is ${MIN_BET}` };
  if (amount > MAX_BET) return { ok: false, reason: `Maximum bet is ${MAX_BET}` };
  return { ok: true, amount };
}

module.exports = {
  MAX_BET,
  MIN_BET,
  badSetupReply,
  getWallet,
  changeWallet,
  addMonthlyGamblingProgress,
  validateBet
};