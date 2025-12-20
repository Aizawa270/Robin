// commands/automod/blacklistwordsoft.js
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
      const embed = new EmbedBuilder()
        .setTitle('Soft blacklist (silent delete)')
        .setColor('#60a5fa')
        .setDescription(words.length ? words.join(', ') : 'No words set.');
      return message.reply({ embeds: [embed] });
    }

    const word = args.join(' ').trim();
    if (!word) return message.reply('Provide a word.');

    if (sub === 'add') {
      client.automod.addSoftWord(message.guild.id, word);
      return message.reply(`Added \`${word}\` to soft blacklist.`);
    } else {
      client.automod.removeSoftWord(message.guild.id, word);
      return message.reply(`Removed \`${word}\` from soft blacklist.`);
    }
  },
};