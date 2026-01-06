const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', '..', 'data', 'birthdays.sqlite'));

module.exports = {
  name: 'birthday',
  category: 'utility',

  async execute(client, message, args) {
    // 📅 CALENDAR
    if (args[0]?.toLowerCase() === 'calendar') {
      const today = new Date();
      const todayKey = today.getMonth() * 31 + today.getDate();

      const rows = db.prepare('SELECT * FROM birthdays').all();
      if (!rows.length) return message.reply('No birthdays saved.');

      const upcoming = rows
        .map(r => {
          let key = (r.month - 1) * 31 + r.day;
          if (key < todayKey) key += 372;
          return { ...r, key };
        })
        .sort((a, b) => a.key - b.key)
        .slice(0, 10);

      const list = upcoming.map(r => {
        const member = message.guild.members.cache.get(r.user_id);
        return `• **${member?.user.username || 'Unknown'}** — ${r.day}/${r.month}`;
      }).join('\n');

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎉 Upcoming Birthdays')
            .setColor('#38bdf8')
            .setDescription(list)
        ]
      });
    }

    // 👤 USER BIRTHDAY
    const user = message.mentions.users.first() || message.author;
    const row = db.prepare('SELECT day, month FROM birthdays WHERE user_id = ?').get(user.id);

    if (!row) return message.reply('No birthday set.');

    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#f472b6')
          .setDescription(`🎂 **${user.username}**’s birthday is **${row.day}/${row.month}**`)
      ]
    });
  }
};