const { EmbedBuilder } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');
const items = require('../../handlers/items');

module.exports = {
  name: 'find',
  category: 'economy',
  description: 'Find random Vyncoins.',
  usage: '!find',
  async execute(client, message, args) {
    const cooldown = gh.getCooldown(message.author.id, 'find');
    if (cooldown > 0) return message.reply(`Wait ${Math.ceil(cooldown/1000)}s.`);

    let coins = Math.floor(Math.random()*50 + 1); // base coins
    coins = items.applyActionModifiers(message.author.id, coins, 'find');

    await gh.changeWallet(client, message.author.id, coins);

    const embed = new EmbedBuilder()
      .setTitle('You went exploring!')
      .setDescription(`You found **${coins}** Vyncoins.`)
      .setColor('#22c55e');

    gh.setCooldown(message.author.id, 'find');
    return message.reply({ embeds: [embed] });
  }
};