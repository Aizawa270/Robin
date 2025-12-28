// commands/economy/find.js
const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'find',
  description: 'Go out and find some coins or maybe even an item!',
  category: 'economy',
  usage: '!find',
  aliases: ['search'],
  async execute(client, message, args) {
    try {
      const res = await mini.find(message.author.id);

      if (!res.ok) {
        if (res.reason === 'cooldown') {
          const mins = Math.floor(res.remaining / 60000);
          const secs = Math.floor((res.remaining % 60000) / 1000);
          return message.reply(`Cooldown active. Try again in ${mins}m ${secs}s.`);
        }
        return message.reply('Could not find anything.');
      }

      let desc = '';
      if (res.nothing) desc = 'You searched but found nothing... better luck next time.';
      else desc = `You found **${res.coins} Vyncoins**!`;

      if (res.droppedItem) {
        const item = res.droppedItem;
        desc += `\n🎁 **Item found:** ${item.name} (${item.rarity.toUpperCase()})`;
        if (item.rarity === 'legendary') desc = `💎 RARE DROP ALERT! 💎\n` + desc;
      }

      const embed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('Find Activity')
        .setDescription(desc);

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('find error:', err);
      return message.reply('Failed to perform find. Check console.');
    }
  }
};