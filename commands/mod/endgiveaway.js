const { PermissionsBitField } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '../data/giveaways.sqlite');
const db = new Database(dbPath);

module.exports = {
  name: 'endgiveaway',
  aliases: ['egw'],
  category: 'utility',
  hidden: true,
  usage: '$endgiveaway [#channel]',
  async execute(client, message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
      return message.reply('You need the **Manage Server** permission.');

    let channel = message.mentions.channels.first() || message.channel;

    // get last active giveaway in channel
    const row = db.prepare('SELECT * FROM giveaways WHERE channel_id = ? ORDER BY end_timestamp ASC').get(channel.id);
    if (!row) return message.reply('No active giveaway in this channel.');

    // call end manually
    require('./startgiveaway').endGiveaway(client, row.message_id);
    message.reply('Giveaway ended.');
  },
};