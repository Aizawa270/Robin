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

async function resolveTargetUser(client, message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(input).catch(() => null);
  }

  const query = String(input).trim();
  if (!query) return null;

  const mention = query.match(/^<@!?(\d{15,20})>$/);
  if (mention) {
    return await client.users.fetch(mention[1]).catch(() => null);
  }

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    await message.guild.members.fetch().catch(() => {});
    const member = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered
    );
    if (member?.user) return member.user;
  }

  return null;
}

function formatBirthday(day, month) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

function getNextBirthdayDate(day, month) {
  const now = new Date();
  const year = now.getFullYear();
  let date = new Date(year, month - 1, day);

  if (date.getTime() < now.getTime()) {
    date = new Date(year + 1, month - 1, day);
  }

  return date;
}

module.exports = {
  name: 'birthday',
  category: 'utility',
  usage: '$birthday [@user|id|username] | $birthday calendar',

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [
          makeEmbed('#ef4444', 'Birthday Failed', 'This command can only be used in a server.')
        ]
      });
    }

    const sub = (args[0] || '').toLowerCase();

    if (sub === 'calendar') {
      const rows = db.prepare(`
        SELECT user_id, day, month
        FROM birthdays
      `).all();

      if (!rows.length) {
        return message.reply({
          embeds: [
            makeEmbed('#f59e0b', 'Birthday Calendar', 'No birthdays have been saved yet.')
          ]
        });
      }

      const upcoming = [];
      for (const row of rows) {
        const date = getNextBirthdayDate(row.day, row.month);
        upcoming.push({
          ...row,
          timestamp: date.getTime()
        });
      }

      upcoming.sort((a, b) => a.timestamp - b.timestamp);

      const lines = [];
      for (const row of upcoming.slice(0, 10)) {
        const user = await client.users.fetch(row.user_id).catch(() => null);
        const name = user?.username || row.user_id;
        lines.push(`**${name}** — ${formatBirthday(row.day, row.month)} — <t:${Math.floor(row.timestamp / 1000)}:R>`);
      }

      return message.reply({
        embeds: [
          makeEmbed('#38bdf8', 'Upcoming Birthdays', lines.join('\n'))
        ]
      });
    }

    const target =
      message.mentions.users.first() ||
      (args[0] ? await resolveTargetUser(client, message, args[0]) : null) ||
      message.author;

    const row = db.prepare(`
      SELECT day, month
      FROM birthdays
      WHERE user_id = ?
    `).get(target.id);

    if (!row) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Birthday Not Set',
            target.id === message.author.id
              ? 'You have not set a birthday yet.'
              : `**${target.username}** has not set a birthday yet.`
          )
        ]
      });
    }

    return message.reply({
      embeds: [
        makeEmbed(
          '#f472b6',
          'Birthday',
          `**${target.username}**'s birthday is **${formatBirthday(row.day, row.month)}**`
        )
      ]
    });
  }
};