'use strict';

const clanCommand = require('./clan');

module.exports = {
  name: 'cq',
  aliases: [],
  description: 'View your clan\'s daily quests.',
  category: 'economy',
  usage: '$cq',
  async execute(client, message) {
    return clanCommand.execute(client, message, ['quest']);
  },
};
