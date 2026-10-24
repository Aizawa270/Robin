const { executeAction } = require('../../handlers/actionGifHelper');

module.exports = {
    name: 'fuck',
    description: 'A joke command that shows a hand-holding anime GIF.',
    category: 'fun',
    usage: '$fuck @user|username|id',

    async execute(client, message, args) {
        return executeAction(client, message, args, {
            action: 'handhold',
            verb: 'holds hands with',
            title: 'Caught in 4K? 🤝',
            selfMessage: 'You cannot hold hands with yourself!',
            usage: '$fuck @user',
        });
    },
};