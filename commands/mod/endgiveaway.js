const Database = require('better-sqlite3');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const DATA_DIR = path.resolve(__dirname, '../data');
const giveawayDB = new Database(path.join(DATA_DIR, 'giveaways.sqlite'));

module.exports = {
  name: 'endgiveaway',
  aliases: ['egw'],
  description: 'End a giveaway manually. Usage: $endgiveaway <channel>',
  category: 'utility',
  hidden: true,
  async execute(client, message, args) {
    let channel = message.channel;
    if (args[0]) {
      const ch = message.guild.channels.cache.get(args[0].replace(/[<#>]/g, ''));
      if (ch) channel = ch;
    }

    const row = giveawayDB.prepare('SELECT * FROM giveaways WHERE channel_id = ? ORDER BY end_timestamp ASC LIMIT 1').get(channel.id);
    if (!row) return message.reply('No active giveaway in this channel.');

    require('./startgiveaway').endGiveaway(client, row.message_id);
    message.reply('Giveaway ended manually.');
  }
};