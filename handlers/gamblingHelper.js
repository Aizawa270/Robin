// handlers/gamblingHelper.js
const { EmbedBuilder } = require('discord.js');
const COOLDOWN_MS = 15_000; // 15s per command

const cooldowns = new Map(); // Map<userId_command, timestamp>

function now() { return Date.now(); }

function getCooldown(userId, cmd) {
  const key = `${userId}_${cmd}`;
  const ts = cooldowns.get(key) || 0;
  return Math.max(0, ts - now());
}

function setCooldown(userId, cmd) {
  const key = `${userId}_${cmd}`;
  cooldowns.set(key, now() + COOLDOWN_MS);
}

function badSetupReply(channel, text = 'Economy handler not found.') {
  return channel.send({ embeds: [new EmbedBuilder().setColor('#f87171').setDescription(text)] });
}

function validateBet(amount) {
  if (!Number.isFinite(amount)) return { ok: false, reason: 'Invalid number' };
  amount = Math.floor(amount);
  if (amount < 1) return { ok: false, reason: 'Minimum bet is 1' };
  if (amount > 100_000) return { ok: false, reason: 'Maximum bet is 100k' };
  return { ok: true, amount };
}

async function getWallet(client, userId) {
  if (!client.economy || typeof client.economy.getUser !== 'function') return null;
  const user = client.economy.getUser(userId);
  return user?.wallet ?? 0;
}

async function changeWallet(client, userId, amount) {
  if (!client.economy) return null;
  if (amount >= 0) {
    client.economy.addWallet(userId, amount);
  } else {
    client.economy.addWallet(userId, amount); // your addWallet handles negative values too
  }
}

async function addMonthlyGamblingProgress(client, userId, amount) {
  if (!client.economy) return;
  client.economy.addNonGamblingEarnedMonth(userId, amount);
}

module.exports = {
  COOLDOWN_MS,
  getCooldown,
  setCooldown,
  badSetupReply,
  validateBet,
  getWallet,
  changeWallet,
  addMonthlyGamblingProgress
};