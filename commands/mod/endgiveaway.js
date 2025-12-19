module.exports = {
  name: 'endgiveaway',
  aliases: ['egw'],
  hidden: true, // Not in help
  async execute(client, message, args) {
    const channel = message.mentions.channels.first() || message.channel;
    const msgId = args[0]; // user must provide message ID of the giveaway

    if (!msgId) return message.reply('Usage: $egw <giveawayMessageId> [channel]');
    const g = client.giveawayDB.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(msgId);
    if (!g) return message.reply('No giveaway found with that message ID.');

    // End giveaway manually
    require('./startgiveaway').endGiveaway(client, msgId);
    message.reply('Giveaway ended manually.');
  },
};