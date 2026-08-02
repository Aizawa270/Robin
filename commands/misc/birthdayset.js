const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'birthdays.sqlite'));
db.pragma('journal_mode = WAL');

db.prepare(`
  CREATE TABLE IF NOT EXISTS birthdays (
    user_id TEXT PRIMARY KEY,
    day INTEGER NOT NULL,
    month INTEGER NOT NULL,
    last_sent_year INTEGER
  )
`).run();

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

function isValidDate(day, month) {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;

  const maxDay = new Date(2000, month, 0).getDate();
  return day <= maxDay;
}

module.exports = {
  name: 'birthdayset',
  category: 'utility',
  usage: '$birthdayset DD/MM',

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Birthday Set Failed', 'This command can only be used in a server.')]
      });
    }

    const input = args[0];
    if (!input || !input.includes('/')) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Birthday Set Usage',
            'Use this format: `birthdayset DD/MM`'
          )
        ]
      });
    }

    const [dayRaw, monthRaw] = input.split('/');
    const day = Number(dayRaw);
    const month = Number(monthRaw);

    if (!isValidDate(day, month)) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Invalid Birthday',
            'Use a real date in the format `DD/MM`.'
          )
        ]
      });
    }

    db.prepare(`
      INSERT INTO birthdays (user_id, day, month, last_sent_year)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(user_id)
      DO UPDATE SET
        day = excluded.day,
        month = excluded.month,
        last_sent_year = NULL
    `).run(message.author.id, day, month);

    return message.reply({
      embeds: [
        makeEmbed(
          '#22c55e',
          'Birthday Saved',
          `Your birthday has been set to **${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}**.`
        )
      ]
    });
  }
};