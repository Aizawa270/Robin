const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', '..', 'data', 'birthdays.sqlite'));

module.exports = {
  name: 'birthdaydel',
  category: 'utility',

  async execute(client, message) {
    const res = db.prepare('DELETE FROM birthdays WHERE user_id = ?').run(message.author.id);
    if (!res.changes) return message.reply('You don’t have a birthday set.');

    message.reply('🗑️ Birthday removed.');
  }
};