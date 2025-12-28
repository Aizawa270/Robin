// commands/economy/beg.js
const { EmbedBuilder } = require('discord.js');
const mini = require('../../handlers/miniActivities');

module.exports = {
  name: 'beg',
  aliases: [],
  description: 'Beg for coins. Small payouts. Funny responses.',
  category: 'economy',
  usage: '!beg',
  async execute(client, message, args) {
    const userId = message.author.id;

    // cooldown check
    const cd = mini.getCooldown(userId, 'beg');
    if (cd > 0) return message.reply(`Cooldown: wait ${Math.ceil(cd/1000)}s.`);

    try {
      const res = await mini.beg(userId);
      if (res.nothing || res.coins === 0) {
        const embed = new EmbedBuilder()
          .setColor('#1f2937')
          .setTitle('Begging Result')
          .setDescription(`No one bothered to help you this time.`)
          .addFields({ name: 'Outcome', value: 'You received nothing. Try again later.' });
        return message.reply({ embeds: [embed] });
      }

      // cap check: ensure we never return >5k (rare)
      const capped = Math.min(res.coins, 5000);

      const embed = new EmbedBuilder()
        .setColor('#06b6d4')
        .setTitle('Begging Result')
        .setDescription(`You received **${capped} Vyncoins**.`)
        .addFields(
          { name: 'Note', value: 'Begging payouts are usually small; rare yields hit the cap.' }
        );

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('beg error:', err);
      return message.reply('Failed to beg. Check console.');
    }
  }
};