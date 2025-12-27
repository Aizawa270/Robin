// commands/economy/register.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'register',
  description: 'Register and get 50,000 Vyncoins.',
  category: 'economy',
  usage: '!register',
  aliases: [],
  async execute(client, message, args) {
    const uid = message.author.id;
    const existing = econ.getUser(uid);
    if (existing && (existing.wallet > 0 || existing.lifetime_earned > 0 || existing.bank > 0)) {
      return message.reply('You are already registered.');
    }
    econ.ensureUser(uid);
    econ.addWallet(uid, 50000);
    econ.addLifetimeEarned(uid, 50000);

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setDescription(`Welcome! You received **50,000 Vyncoins** to start your journey.`);

    return message.reply({ embeds: [embed] });
  }
};