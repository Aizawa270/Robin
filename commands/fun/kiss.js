const {
    executeAction,
} = require('../../handlers/actionGifHelper');

module.exports = {
    name: 'kiss',

    description: 'Kiss someone with an anime GIF.',

    category: 'fun',

    usage: '$kiss @user|username|id',

    async execute(client, message, args) {
        return executeAction(
            client,
            message,
            args,
            {
                action: 'kiss',

                verb: 'kisses',

                title: 'Kiss!',

                selfMessage:
                    'You cannot kiss yourself…',
            }
        );
    },
};