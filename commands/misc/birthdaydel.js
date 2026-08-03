const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'birthdays.sqlite'));
db.pragma('journal_mode = WAL');

// Updated schema
db.prepare(`
  CREATE TABLE IF NOT EXISTS birthdays (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    month INTEGER NOT NULL,
    last_sent_year INTEGER,
    PRIMARY KEY (guild_id, user_id)
  )
`).run();

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

module.exports = {
  name: 'birthdaydel',
  category: 'utility',
  usage: '$birthdaydel',

  async execute(client, message) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Birthday Delete Failed', 'This command can only be used in a server.')]
      });
    }

    // Delete the birthday only for this guild + user
    const res = db.prepare(
      'DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?'
    ).run(message.guild.id, message.author.id);

    if (!res.changes) {
      return message.reply({
        embeds: [
          makeEmbed('#f59e0b', 'Birthday Not Found', 'You do not have a birthday set in this server.')
        ]
      });
    }

    return message.reply({
      embeds: [
        makeEmbed('#22c55e', 'Birthday Removed', 'Your birthday has been removed from this server.')
      ]
    });
  }
};