const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'blacklistword',
  aliases: ['bwl'],
  description: 'Add/remove/list hard blacklist words (triggers automod).',
  category: 'automod',
  hidden: true,
  usage: '$blacklistword add|remove|list <word>',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has('Administrator')) return message.reply('Admins only.');

    const sub = (args.shift() || '').toLowerCase();
    if (!['add', 'remove', 'list'].includes(sub)) {
      return message.reply('Usage: `$blacklistword add|remove|list <word>`');
    }

    if (sub === 'list') {
      const words = client.automod.listHardWords(message.guild.id);
      // ✅ USE message.createEmbed()
      const embed = message.createEmbed({
        title: 'Hard blacklist (triggers automod)',
        description: words.length ? words.join(', ') : 'No words set.'
      });
      return message.reply({ embeds: [embed] });
    }

    const word = args.join(' ').trim();
    if (!word) return message.reply('Provide a word.');

    if (sub === 'add') {
      // FIX: Ensure database is updated
      client.automod.addHardWord(message.guild.id, word);
      
      // Double-check by updating cache directly
      if (!client.blacklistCache.has(message.guild.id)) {
        client.blacklistCache.set(message.guild.id, { hard: [], soft: [] });
      }
      const cache = client.blacklistCache.get(message.guild.id);
      const lowerWord = word.toLowerCase().trim();
      if (!cache.hard.includes(lowerWord)) {
        cache.hard.push(lowerWord);
      }
      
      return message.reply(`Added \`${word}\` to hard blacklist.`);
    } else {
      // FIX: Ensure database is updated
      client.automod.removeHardWord(message.guild.id, word);
      
      // Double-check by updating cache directly
      if (client.blacklistCache.has(message.guild.id)) {
        const cache = client.blacklistCache.get(message.guild.id);
        const lowerWord = word.toLowerCase().trim();
        cache.hard = cache.hard.filter(w => w !== lowerWord);
      }
      
      return message.reply(`Removed \`${word}\` from hard blacklist.`);
    }
  },
};