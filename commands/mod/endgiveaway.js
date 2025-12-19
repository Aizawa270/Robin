module.exports = {
  name: 'endgiveaway',
  aliases: ['egw'],
  hidden: true,
  async execute(client, message, args) {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('You are not allowed to end giveaways.');
    }

    const msgId = args[0];
    if (!msgId) {
      return message.reply('Usage: `$egw <giveawayMessageId>`');
    }

    const g = client.giveawayDB
      .prepare('SELECT * FROM giveaways WHERE message_id = ?')
      .get(msgId);

    if (!g) {
      return message.reply('No giveaway found with that message ID.');
    }

    await require('./startgiveaway').endGiveaway(client, msgId);
    message.reply('Giveaway ended.');
  },
};