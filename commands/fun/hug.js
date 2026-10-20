const {
    executeAction,
} = require('../../handlers/actionGifHelper');

module.exports = {
    name: 'hug',

    description: 'Hug someone with an anime GIF.',

    category: 'fun',

    usage: '$hug @user|username|id',

    async execute(client, message, args) {
        return executeAction(
            client,
            message,
            args,
            {
                action: 'hug',

                verb: 'hugs',

                title: 'Hug!',

                selfMessage:
                    'You cannot hug yourself, but I can hug you! 🤗',
            }
        );
    },
};