// commands/automod/blacklistword.js
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
      const embed = new EmbedBuilder()
        .setTitle('Hard blacklist (triggers automod)')
        .setColor('#fb7185')
        .setDescription(words.length ? words.join(', ') : 'No words set.');
      return message.reply({ embeds: [embed] });
    }

    const word = args.join(' ').trim();
    if (!word) return message.reply('Provide a word.');

    if (sub === 'add') {
      client.automod.addHardWord(message.guild.id, word);
      return message.reply(`Added \`${word}\` to hard blacklist.`);
    } else {
      client.automod.removeHardWord(message.guild.id, word);
      return message.reply(`Removed \`${word}\` from hard blacklist.`);
    }
  },
};