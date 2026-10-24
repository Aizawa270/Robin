const {
    executeAction,
} = require('../../handlers/actionGifHelper');

module.exports = {
    name: 'cuddle',

    description: 'Cuddle someone with an anime GIF.',

    category: 'fun',

    usage: '$cuddle @user|username|id',

    async execute(client, message, args) {
        return executeAction(
            client,
            message,
            args,
            {
                action: 'cuddle',

                verb: 'cuddles',

                title: 'Cuddle!',

                selfMessage:
                    'You cannot cuddle yourself! Pick someone else.',
            }
        );
    },
};