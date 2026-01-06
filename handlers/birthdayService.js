const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

const BIRTHDAY_CHANNEL_ID = '1440412904364179647';

const db = new Database(path.join(__dirname, '..', 'data', 'birthdays.sqlite'));
db.prepare(`
  CREATE TABLE IF NOT EXISTS birthdays (
    user_id TEXT PRIMARY KEY,
    day INTEGER NOT NULL,
    month INTEGER NOT NULL,
    last_sent_year INTEGER
  )
`).run();

module.exports = (client) => {
  setInterval(async () => {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const rows = db.prepare(`
      SELECT * FROM birthdays
      WHERE day = ? AND month = ?
    `).all(day, month);

    if (!rows.length) return;

    const channel = await client.channels.fetch(BIRTHDAY_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    for (const row of rows) {
      if (row.last_sent_year === year) continue;

      const user = await client.users.fetch(row.user_id).catch(() => null);
      if (!user) continue;

      const embed = new EmbedBuilder()
        .setColor('#f472b6')
        .setTitle('🎉 Happy Birthday!')
        .setDescription(`Happy Birthday **${user.username}** 🥳🎂\nHope today goes hard.`)
        .setThumbnail(user.displayAvatarURL({ size: 1024 }))
        .setTimestamp();

      // 📩 DM USER
      await user.send({ embeds: [embed] }).catch(() => {});

      // 📢 SERVER ANNOUNCEMENT
      await channel.send({
        content: `🎉 <@${user.id}>`,
        embeds: [embed],
      });

      // ✅ MARK AS SENT
      db.prepare(`
        UPDATE birthdays
        SET last_sent_year = ?
        WHERE user_id = ?
      `).run(year, user.id);
    }
  }, 10 * 60 * 1000); // every 10 mins
};