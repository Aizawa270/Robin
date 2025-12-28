// commands/economy/explore.js
const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'explore',
  description: 'Explore the world to earn coins and possibly discover rare items!',
  category: 'economy',
  usage: '!explore',
  aliases: ['adventure'],
  async execute(client, message, args) {
    try {
      const res = await mini.explore(message.author.id);

      if (!res.ok) {
        if (res.reason === 'cooldown') {
          const mins = Math.floor(res.remaining / 60000);
          const secs = Math.floor((res.remaining % 60000) / 1000);
          return message.reply(`Cooldown active. Try again in ${mins}m ${secs}s.`);
        }
        return message.reply('Could not explore successfully.');
      }

      let desc = '';
      if (res.nothing) desc = 'Your expedition yielded nothing... the world can be harsh.';
      else desc = `You explored and earned **${res.coins} Vyncoins**!`;

      if (res.droppedItem) {
        const item = res.droppedItem;
        desc += `\n🎁 **Item discovered:** ${item.name} (${item.rarity.toUpperCase()})`;
        if (item.rarity === 'legendary') desc = `💎 LEGENDARY ITEM FOUND! 💎\n` + desc;
      }

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Explore Activity')
        .setDescription(desc);

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('explore error:', err);
      return message.reply('Failed to explore. Check console.');
    }
  }
};