const {
  executeAction,
} = require('../../handlers/actionGifHelper');

module.exports = {
  name: 'slap',
  description: 'Slap someone with an anime GIF.',
  category: 'fun',
  usage: '$slap @user|username|id',

  async execute(client, message, args) {
    return executeAction(
      client,
      message,
      args,
      {
        action: 'slap',
        verb: 'slaps',
        title: 'Slap!',
        selfMessage: 'Why are you trying to slap yourself..?',
      }
    );
  },
};