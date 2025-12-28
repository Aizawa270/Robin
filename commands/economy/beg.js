// commands/economy/beg.js
const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'beg',
  description: 'Beg for coins, and maybe get lucky with an item!',
  category: 'economy',
  usage: '!beg',
  aliases: ['panhandle'],
  async execute(client, message, args) {
    try {
      const res = await mini.beg(message.author.id);

      if (!res.ok) {
        if (res.reason === 'cooldown') {
          const mins = Math.floor(res.remaining / 60000);
          const secs = Math.floor((res.remaining % 60000) / 1000);
          return message.reply(`Cooldown active. Try again in ${mins}m ${secs}s.`);
        }
        return message.reply('No one gave you anything this time...');
      }

      let desc = '';
      if (res.nothing) desc = 'No one gave you anything... try again later.';
      else desc = `Someone gave you **${res.coins} Vyncoins**!`;

      if (res.droppedItem) {
        const item = res.droppedItem;
        desc += `\n🎁 **Item received:** ${item.name} (${item.rarity.toUpperCase()})`;
        if (item.rarity === 'legendary') desc = `💎 LEGENDARY ITEM RECEIVED! 💎\n` + desc;
      }

      const embed = new EmbedBuilder()
        .setColor('#f87171')
        .setTitle('Beg Activity')
        .setDescription(desc);

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('beg error:', err);
      return message.reply('Failed to beg. Check console.');
    }
  }
};