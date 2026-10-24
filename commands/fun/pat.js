const {
    executeAction,
} = require('../../handlers/actionGifHelper');

module.exports = {
    name: 'pat',

    description: 'Pat someone with an anime GIF.',

    category: 'fun',

    usage: '$pat @user|username|id',

    async execute(client, message, args) {
        return executeAction(
            client,
            message,
            args,
            {
                action: 'pat',

                verb: 'pats',

                title: 'Pat!',

                selfMessage:
                    'You cannot pat yourself! Pick someone else.',
            }
        );
    },
};