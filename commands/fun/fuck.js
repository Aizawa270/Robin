const { executeAction } = require('../../handlers/actionGifHelper');

module.exports = {
name: 'fuck',
description: 'A joke command with a hand-holding anime GIF.',
category: 'fun',
usage: '$fuck @user|username|id',

async execute(client, message, args) {
    return executeAction(client, message, args, {
        action: 'handhold',
        verb: 'fucks',
        title: '💀',
        selfMessage: 'You cannot target yourself!',
        usage: '$fuck @user',
    });
},

};