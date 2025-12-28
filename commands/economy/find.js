// commands/economy/find.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');
const items = require('../../handlers/items');

const COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes default

module.exports = {
  name: 'find',
  category: 'economy',
  usage: '!find',
  async execute(client, message, args) {
    const cdLeft = econ.getCooldown(message.author.id, 'find');
    if (cdLeft > 0) return message.reply(`Wait ${Math.ceil(cdLeft/1000)}s.`);
    // small chance to find item, small chance to lose money (snake), else coins
    const r = Math.random();
    if (r < 0.06) {
      // find rare item (pick random rare/epic)
      const all = items.listMasterItems().filter(i => ['rare','epic','legendary'].includes(i.rarity));
      const pick = all[Math.floor(Math.random()*all.length)];
      if (pick) {
        items.giveItem(message.author.id, pick.id, 1);
        econ.setCooldown(message.author.id, 'find', COOLDOWN_MS);
        econ.addNonGamblingEarnedMonth(message.author.id, 0);
        const embed = new EmbedBuilder().setTitle('You found something!').setColor('#a78bfa').setDescription(`You discovered **${pick.name}** (${pick.rarity}).`);
        return message.reply({ embeds: [embed] });
      }
    }
    if (r < 0.12) {
      // negative: snake -> small loss
      const loss = Math.floor(200 + Math.random() * 800);
      econ.changeWallet(message.author.id, -loss);
      econ.setCooldown(message.author.id, 'find', COOLDOWN_MS + 5*60*1000);
      const embed = new EmbedBuilder().setTitle('Oh no...').setColor('#f87171').setDescription(`You encountered a dangerous creature and lost **${loss}** Vyncoins.`);
      return message.reply({ embeds: [embed] });
    }
    // else coins up to 15k (rare)
    const amount = (Math.random() < 0.05) ? Math.floor(5000 + Math.random()*10000) : Math.floor(100 + Math.random()*2000);
    econ.changeWallet(message.author.id, amount);
    econ.addNonGamblingEarnedMonth(message.author.id, amount);
    econ.setCooldown(message.author.id, 'find', COOLDOWN_MS);
    const embed = new EmbedBuilder().setTitle('Find Result').setColor('#22c55e').setDescription(`You found **${amount}** Vyncoins.`);
    return message.reply({ embeds: [embed] });
  }
};