const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'delit',
  description: 'Deletes a replied message and your command message.',
  category: 'mod',
  usage: '!delit (reply to a message)',

  async execute(client, message, args) {
    // Allowed users
    const allowedUsers = [
      '852839588689870879', // Astrix
      '1447894643277561856',
      '1431650083585396897'
    ];

    if (!allowedUsers.includes(message.author.id)) {
      return message.reply('❌ You are not allowed to use this.');
    }

    if (!message.reference || !message.reference.messageId) {
      return message.reply('❌ You must reply to a message to use this.');
    }

    try {
      // Fetch the replied-to message
      const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
      if (repliedMsg) {
        await repliedMsg.delete().catch(() => {});
      }

      // Delete your command message
      await message.delete().catch(() => {});
    } catch (err) {
      console.error('Delit error:', err);
      message.reply('❌ Failed to delete the message.');
    }
  },
};