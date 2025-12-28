const { EmbedBuilder } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');
const items = require('../../handlers/items');

module.exports = {
  name: 'beg',
  category: 'economy',
  description: 'Beg for Vyncoins from NPCs.',
  usage: '!beg',
  async execute(client, message, args) {
    const cooldown = gh.getCooldown(message.author.id, 'beg');
    if (cooldown > 0) return message.reply(`Wait ${Math.ceil(cooldown/1000)}s before begging again.`);

    // base coins: random 5-50
    let coins = Math.floor(Math.random()*46 + 5);
    coins = items.applyActionModifiers(message.author.id, coins, 'beg');

    // max cap: 100
    if (coins > 100) coins = 100;

    await gh.changeWallet(client, message.author.id, coins);

    const embed = new EmbedBuilder()
      .setTitle('You begged for coins...')
      .setDescription(`Someone gave you **${coins}** Vyncoins.`)
      .setColor('#facc15');

    gh.setCooldown(message.author.id, 'beg');
    return message.reply({ embeds: [embed] });
  }
};