const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'blacklistwordsoft',
  aliases: ['bwsoft'],
  description: 'Add/remove/list soft blacklist words (silent delete).',
  category: 'automod',
  hidden: true,
  usage: '$blacklistwordsoft add|remove|list <word>',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has('Administrator')) return message.reply('Admins only.');

    const sub = (args.shift() || '').toLowerCase();
    if (!['add', 'remove', 'list'].includes(sub)) {
      return message.reply('Usage: `$blacklistwordsoft add|remove|list <word>`');
    }

    if (sub === 'list') {
      const words = client.automod.listSoftWords(message.guild.id);
      // ✅ USE message.createEmbed()
      const embed = message.createEmbed({
        title: 'Soft blacklist (silent delete)',
        description: words.length ? words.join(', ') : 'No words set.'
      });
      return message.reply({ embeds: [embed] });
    }

    const word = args.join(' ').trim();
    if (!word) return message.reply('Provide a word.');

    if (sub === 'add') {
      // FIX: Ensure database is updated
      client.automod.addSoftWord(message.guild.id, word);
      
      // Double-check by updating cache directly
      if (!client.blacklistCache.has(message.guild.id)) {
        client.blacklistCache.set(message.guild.id, { hard: [], soft: [] });
      }
      const cache = client.blacklistCache.get(message.guild.id);
      const lowerWord = word.toLowerCase().trim();
      if (!cache.soft.includes(lowerWord)) {
        cache.soft.push(lowerWord);
      }
      
      return message.reply(`Added \`${word}\` to soft blacklist.`);
    } else {
      // FIX: Ensure database is updated
      client.automod.removeSoftWord(message.guild.id, word);
      
      // Double-check by updating cache directly
      if (client.blacklistCache.has(message.guild.id)) {
        const cache = client.blacklistCache.get(message.guild.id);
        const lowerWord = word.toLowerCase().trim();
        cache.soft = cache.soft.filter(w => w !== lowerWord);
      }
      
      return message.reply(`Removed \`${word}\` from soft blacklist.`);
    }
  },
};