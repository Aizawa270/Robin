const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', '..', 'data', 'birthdays.sqlite'));

module.exports = {
  name: 'birthdayset',
  category: 'utility',
  usage: '!birthdayset DD/MM',

  async execute(client, message, args) {
    const input = args[0];
    if (!input || !input.includes('/')) {
      return message.reply('Use `!birthdayset DD/MM`');
    }

    const [day, month] = input.split('/').map(Number);
    if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) {
      return message.reply('Invalid date.');
    }

    db.prepare(`
      INSERT INTO birthdays (user_id, day, month, last_sent_year)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(user_id)
      DO UPDATE SET day = excluded.day, month = excluded.month
    `).run(message.author.id, day, month);

    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#22c55e')
          .setDescription(`🎂 Birthday set to **${day}/${month}**`)
      ]
    });
  }
};