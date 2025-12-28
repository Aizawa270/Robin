const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'explore',
  description: 'Explore far areas for coins or items. Legendary items are extremely rare.',
  category: 'economy',
  usage: '!explore',
  aliases: [],
  async execute(client, message, args) {
    const res = await mini.explore(message.author.id);
    if (!res.ok && res.reason === 'cooldown') {
      const secs = Math.floor(res.remaining / 1000);
      return message.reply(`Cooldown active. Try again in ${secs}s.`);
    }

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setTitle('You went exploring!');

    let desc = `You found **${res.coins} Vyncoins**.`;
    if (res.nothing) desc = 'You found nothing this time.';
    if (res.droppedItem) desc += `\nYou also found a **${res.droppedItem.name}** (${res.droppedItem.rarity})!`;

    embed.setDescription(desc);
    message.reply({ embeds: [embed] });
  }
};