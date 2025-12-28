// commands/economy/find.js
const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'find',
  description: 'Find coins and maybe items!',
  category: 'economy',
  usage: '!find',
  async execute(client, message, args) {
    try {
      const res = await mini.find(message.author.id);
      if (!res.ok) {
        if (res.reason === 'cooldown') {
          return message.reply(`Cooldown active. Try again in ${Math.floor(res.remaining/1000)}s.`);
        }
        return message.reply('Something went wrong.');
      }

      const embed = new EmbedBuilder()
        .setTitle('You searched around...')
        .setColor('#22c55e')
        .setDescription(`Coins found: **${res.coins}**${res.droppedItem ? `\nYou also found: **${res.droppedItem.name}** (${res.droppedItem.rarity})` : ''}`);

      message.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply('Error running find.');
    }
  }
};