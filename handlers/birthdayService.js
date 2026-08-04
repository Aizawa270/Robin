const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'birthdays.sqlite'));
db.pragma('journal_mode = WAL');

function ensureBirthdaySchema() {
  const birthdayTableInfo = db.prepare(`PRAGMA table_info(birthdays)`).all();
  const birthdayColumns = birthdayTableInfo.map(c => c.name);

  const hasGuildSchema =
    birthdayColumns.includes('guild_id') &&
    birthdayColumns.includes('user_id') &&
    birthdayColumns.includes('day') &&
    birthdayColumns.includes('month');

  if (birthdayColumns.length > 0 && !hasGuildSchema) {
    try {
      db.exec(`ALTER TABLE birthdays RENAME TO birthdays_legacy`);
    } catch {}
  }

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

  db.prepare(`
    CREATE TABLE IF NOT EXISTS birthday_channels (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL
    )
  `).run();
}

ensureBirthdaySchema();

function getBirthdayChannelId(guildId) {
  return db.prepare(`
    SELECT channel_id
    FROM birthday_channels
    WHERE guild_id = ?
  `).get(guildId)?.channel_id || null;
}

function getTodayKey() {
  const now = new Date();
  return {
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

module.exports = (client) => {
  setInterval(async () => {
    const { day, month, year } = getTodayKey();

    for (const [guildId] of client.guilds.cache) {
      const channelId = getBirthdayChannelId(guildId);
      if (!channelId) continue;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased?.()) continue;

      const birthdayRows = db.prepare(`
        SELECT user_id, day, month, last_sent_year
        FROM birthdays
        WHERE guild_id = ? AND day = ? AND month = ?
      `).all(guildId, day, month);

      if (!birthdayRows.length) continue;

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
          embeds: [embed],
        }).catch(() => {});

        db.prepare(`
          UPDATE birthdays
          SET last_sent_year = ?
          WHERE guild_id = ? AND user_id = ?
        `).run(year, guildId, user.id);
      }
    }
  }, 10 * 60 * 1000);
};