// commands/economy/beg.js
const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'beg',
  description: 'Beg for coins and maybe get lucky with items!',
  category: 'economy',
  usage: '!beg',
  async execute(client, message, args) {
    try {
      const res = await mini.beg(message.author.id);

      if (!res.ok) {
        if (res.reason === 'cooldown') {
          return message.reply(`Cooldown active. Try again in ${Math.floor(res.remaining/1000)}s.`);
        }
        return message.reply('Something went wrong.');
      }

      const embed = new EmbedBuilder()
        .setTitle('You begged around...')
        .setColor('#facc15')
        .setDescription(`Coins received: **${res.coins}**${res.droppedItem ? `\nYou also found: **${res.droppedItem.name}** (${res.droppedItem.rarity})` : ''}`);

      message.reply({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      message.reply('Error running beg.');
    }
  }
};