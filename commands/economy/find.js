const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'find',
  description: 'Try to find coins or items.',
  category: 'economy',
  usage: '!find',
  aliases: [],
  async execute(client, message, args) {
    const res = await mini.find(message.author.id);
    if (!res.ok && res.reason === 'cooldown') {
      const secs = Math.floor(res.remaining / 1000);
      return message.reply(`Cooldown active. Try again in ${secs}s.`);
    }

    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle('You went exploring for loot!');

    let desc = `You found **${res.coins} Vyncoins**.`;
    if (res.nothing) desc = 'You found nothing this time.';
    if (res.droppedItem) desc += `\nYou also found a **${res.droppedItem.name}**!`;

    embed.setDescription(desc);
    message.reply({ embeds: [embed] });
  }
};