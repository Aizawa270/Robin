// commands/economy/beg.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');

const COOLDOWN_MS = 15 * 60 * 1000; // 15min default cooldown

const LINES = [
  "You begged at the fountain and someone pity-bought you a snack.",
  "A kind stranger tossed you a coin. You're alive.",
  "You held a sign. Someone gave spare change and a stare.",
  "You tripped and a wallet burst open — small haul.",
  "A rare blessing! Someone felt generous."
];

module.exports = {
  name: 'beg',
  category: 'economy',
  usage: '!beg',
  async execute(client, message, args) {
    const cdLeft = econ.getCooldown(message.author.id, 'beg');
    if (cdLeft > 0) return message.reply(`Wait ${Math.ceil(cdLeft/1000)}s.`);
    // tiny RNG
    const roll = Math.random();
    let amount = 0;
    if (roll < 0.02) { // rare best -> up to 5k
      amount = Math.floor(1000 + Math.random() * 4000);
    } else if (roll < 0.20) {
      amount = Math.floor(200 + Math.random() * 800);
    } else {
      amount = Math.floor(20 + Math.random() * 180);
    }
    // message
    const text = LINES[Math.floor(Math.random()*LINES.length)];
    econ.changeWallet(message.author.id, amount);
    econ.setCooldown(message.author.id, 'beg', COOLDOWN_MS);
    // non-gambling earned counts
    econ.addNonGamblingEarnedMonth(message.author.id, amount);
    const embed = new EmbedBuilder()
      .setColor('#f97316')
      .setTitle('Beg Result')
      .setDescription(`${text}\n\nYou received **${amount}** Vyncoins.`);
    return message.reply({ embeds: [embed] });
  }
};