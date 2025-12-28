// commands/economy/explore.js
const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'explore',
  description: 'Explore the world to earn coins and discover rare items!',
  category: 'economy',
  usage: '!explore',
  async execute(client, message, args) {
    try {
      const res = await mini.explore(message.author.id);

      if (!res.ok) {
        if (res.reason === 'cooldown') {
          return message.reply(`Cooldown active. Try again in ${Math.floor(res.remaining/1000)}s.`);
        }
        return message.reply('Something went wrong.');
      }

      const embed = new EmbedBuilder()
        .setTitle('You explored the surroundings...')
        .setColor('#3b82f6')
        .setDescription(`Coins found: **${res.coins}**${res.droppedItem ? `\nYou discovered: **${res.droppedItem.name}** (${res.droppedItem.rarity})` : ''}`);

      message.reply({ embeds: [embed] });

    } catch (err) {
      console.error(err);
      message.reply('Error running explore.');
    }
  }
};