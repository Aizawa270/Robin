const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'delit',
  aliases: ['del'], // ✅ alias added
  description: 'Deletes the replied message and the command message.',
  category: 'mod',
  usage: '!delit (reply to a message)',

  async execute(client, message) {
    if (!message.guild) return;

    const OWNER_ID = '852839588689870879';

    const ALLOWED_ROLES = [
      '1447894643277561856',
      '1431646610752012420',
    ];

    const ALLOWED_USERS = [
      '821734525247815741', // new user added
    ];

    // permission check
    const isOwner = message.author.id === OWNER_ID;
    const hasRole = message.member.roles.cache.some(role =>
      ALLOWED_ROLES.includes(role.id)
    );
    const isAllowedUser = ALLOWED_USERS.includes(message.author.id);

    if (!isOwner && !hasRole && !isAllowedUser) {
      return message.reply('You are not allowed to use this command.');
    }

    // must be a reply
    if (!message.reference?.messageId) {
      return message.reply('Reply to a message to delete it.');
    }

    try {
      const targetMsg = await message.channel.messages.fetch(
        message.reference.messageId
      );

      await targetMsg.delete().catch(() => {});
      await message.delete().catch(() => {});
    } catch (err) {
      console.error('delit error:', err);
      message.reply('Failed to delete the message.');
    }
  },
};