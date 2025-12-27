const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'cleandb',
  category: 'mod',
  description: 'Clears stuck battle data',

  async execute(client, message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    client.battleDB.prepare('DELETE FROM ongoing_battles').run();
    return message.reply('Battle database cleaned.');
  },
};