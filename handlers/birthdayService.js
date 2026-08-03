// handlers/birthdayService.js
const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
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

db.prepare(`
  CREATE TABLE IF NOT EXISTS birthday_channels (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL
  )
`).run();

function getBirthdayChannelId(guildId) {
  return db.prepare(`
    SELECT channel_id
    FROM birthday_channels
    WHERE guild_id = ?
  `).get(guildId)?.channel_id || null;
}

function getTodayKey() {
  const now = new Date();
  return { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() };
}

module.exports = (client) => {
  setInterval(async () => {
    const { day, month, year } = getTodayKey();

    const birthdayRows = db.prepare(`
      SELECT user_id, day, month, last_sent_year
      FROM birthdays
      WHERE day = ? AND month = ?
    `).all(day, month);

    if (!birthdayRows.length) return;

    const guildIds = [...new Set(client.guilds.cache.map(g => g.id))];

    for (const guildId of guildIds) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;

      const channelId = getBirthdayChannelId(guildId);
      if (!channelId) continue;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased?.()) continue;

      for (const row of birthdayRows) {
        if (row.last_sent_year === year) continue;

        const user = await client.users.fetch(row.user_id).catch(() => null);
        if (!user) continue;

        const embed = new EmbedBuilder()
          .setColor('#f472b6')
          .setTitle('Happy Birthday')
          .setDescription(`Today is **${user.username}**'s birthday.`)
          .setThumbnail(user.displayAvatarURL({ size: 1024 }))
          .setTimestamp();

        await user.send({ embeds: [embed] }).catch(() => {});
        await channel.send({
          content: `<@${user.id}>`,
          embeds: [embed]
        }).catch(() => {});

        db.prepare(`
          UPDATE birthdays
          SET last_sent_year = ?
          WHERE user_id = ?
        `).run(year, user.id);
      }
    }
  }, 10 * 60 * 1000);
};