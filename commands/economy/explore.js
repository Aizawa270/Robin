// commands/economy/explore.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');
const items = require('../../handlers/items');

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

module.exports = {
  name: 'explore',
  category: 'economy',
  usage: '!explore',
  async execute(client, message, args) {
    const cdLeft = econ.getCooldown(message.author.id, 'explore');
    if (cdLeft > 0) return message.reply(`Wait ${Math.ceil(cdLeft/1000)}s.`);
    // outcomes: big coin, item (common->legendary), nothing (15m block combined)
    const roll = Math.random();
    if (roll < 0.07) {
      // legendary-ish item
      const all = items.listMasterItems().filter(i => i.rarity === 'legendary' || i.rarity === 'epic');
      const pick = all[Math.floor(Math.random()*all.length)];
      if (pick) {
        items.giveItem(message.author.id, pick.id, 1);
        econ.setCooldown(message.author.id, 'explore', COOLDOWN_MS);
        const embed = new EmbedBuilder().setTitle('Exploration — Legendary Find').setColor('#f97316').setDescription(`You explored and found **${pick.name}** (${pick.rarity}).`);
        econ.addNonGamblingEarnedMonth(message.author.id, 0);
        return message.reply({ embeds: [embed] });
      }
    }
    if (roll < 0.18) {
      // coins medium-high
      const amount = Math.floor(2000 + Math.random() * 48000); // up to 50k
      econ.changeWallet(message.author.id, amount);
      econ.addNonGamblingEarnedMonth(message.author.id, amount);
      econ.setCooldown(message.author.id, 'explore', COOLDOWN_MS);
      const embed = new EmbedBuilder().setTitle('Exploration — Loot').setColor('#06b6d4').setDescription(`You explored and collected **${amount}** Vyncoins.`);
      return message.reply({ embeds: [embed] });
    }
    if (roll < 0.30) {
      // mediocre coins
      const amount = Math.floor(200 + Math.random()*1800);
      econ.changeWallet(message.author.id, amount);
      econ.addNonGamblingEarnedMonth(message.author.id, amount);
      econ.setCooldown(message.author.id, 'explore', COOLDOWN_MS);
      return message.reply({ embeds: [new EmbedBuilder().setTitle('Exploration — Found').setColor('#22c55e').setDescription(`You found **${amount}** Vyncoins.`)] });
    }
    // else nothing but impose 15m additional cooldown on find/explore
    econ.setCooldown(message.author.id, 'explore', COOLDOWN_MS + (5 * 60 * 1000));
    econ.setCooldown(message.author.id, 'find', 15 * 60 * 1000);
    return message.reply({ embeds: [new EmbedBuilder().setTitle('Exploration — Nothing').setColor('#94a3b8').setDescription('You explored and returned empty-handed.')] });
  }
};