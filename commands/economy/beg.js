const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'beg',
  description: 'Beg for coins or items.',
  category: 'economy',
  usage: '!beg',
  aliases: [],
  async execute(client, message, args) {
    const res = await mini.beg(message.author.id);
    if (!res.ok && res.reason === 'cooldown') {
      const secs = Math.floor(res.remaining / 1000);
      return message.reply(`Cooldown active. Try again in ${secs}s.`);
    }

    const embed = new EmbedBuilder()
      .setColor('#f97316')
      .setTitle('You begged for coins!');

    let desc = `You received **${res.coins} Vyncoins**.`;
    if (res.nothing) desc = 'Nobody gave you anything this time.';
    if (res.droppedItem) desc += `\nYou also found a **${res.droppedItem.name}** (${res.droppedItem.rarity})!`;

    embed.setDescription(desc);
    message.reply({ embeds: [embed] });
  }
};