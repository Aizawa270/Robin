const { PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'vsay',
  description: 'Makes the bot repeat your message. Admins only.',
  category: 'utility',
  usage: '$vsay <message>',
  async execute(client, message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('Only administrators can use this command.');
    }

    const text = args.join(' ');
    if (!text) {
      return message.reply('Please provide a message to say. Example: `$vsay hello world`');
    }

    // Optionally delete the user's command to keep chat clean
    if (message.deletable) {
      await message.delete().catch(() => {});
    }

    await message.channel.send(text);
  },
};