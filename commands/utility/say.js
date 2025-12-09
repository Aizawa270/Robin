module.exports = {
  name: 'say',
  description: 'Makes the bot repeat your message.',
  category: 'utility',
  usage: '$say <message>',
  async execute(client, message, args) {
    const text = args.join(' ');
    if (!text) {
      return message.reply('Please provide a message to say. Example: `$say hello world`');
    }

    // Optionally delete the user's command to keep chat clean
    if (message.deletable) {
      await message.delete().catch(() => {});
    }

    await message.channel.send(text);
  },
};