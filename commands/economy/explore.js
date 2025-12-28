const { EmbedBuilder } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');
const items = require('../../handlers/items');

module.exports = {
  name: 'explore',
  category: 'economy',
  description: 'Explore the world to find Vyncoins.',
  usage: '!explore',
  async execute(client, message, args) {
    const cooldown = gh.getCooldown(message.author.id, 'explore');
    if (cooldown > 0) return message.reply(`Wait ${Math.ceil(cooldown/1000)}s before exploring again.`);

    // base coins: random 10-75
    let coins = Math.floor(Math.random()*66 + 10);
    coins = items.applyActionModifiers(message.author.id, coins, 'explore');

    // max cap: 150
    if (coins > 150) coins = 150;

    await gh.changeWallet(client, message.author.id, coins);

    const embed = new EmbedBuilder()
      .setTitle('You explored the lands!')
      .setDescription(`You found **${coins}** Vyncoins.`)
      .setColor('#22d3ee');

    gh.setCooldown(message.author.id, 'explore');
    return message.reply({ embeds: [embed] });
  }
};