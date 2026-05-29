// commands/utility/afk.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

const AFK_COLOR = '#ec4899';
const SUCCESS_COLOR = '#22c55e';

// SQLite setup
const db = new Database(path.join(__dirname, '../../data/afk.db'));
db.prepare(`
  CREATE TABLE IF NOT EXISTS afk (
    user_id TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    since INTEGER NOT NULL
  )
`).run();

const returnBuffer = new Map();

module.exports = {
  name: 'afk',
  description: 'Sets your AFK status with an optional reason.',
  category: 'utility',
  usage: '$afk [reason]',

  async execute(client, message, args) {
    const reason = args.join(' ') || 'No reason provided';

    db.prepare(`INSERT OR REPLACE INTO afk (user_id, reason, since) VALUES (?, ?, ?)`)
      .run(message.author.id, reason, Date.now());

    if (!client.afk) client.afk = new Map();
    client.afk.set(message.author.id, { reason, since: Date.now() });

    const embed = new EmbedBuilder()
      .setColor(AFK_COLOR)
      .setTitle('AFK Status')
      .setDescription(`🌙 | You are now AFK. Reason: ${reason}`)
      .setThumbnail(message.author.displayAvatarURL({ size: 256 }));

    await message.reply({ embeds: [embed] });
  },

  restoreAfk(client) {
    if (!client.afk) client.afk = new Map();
    const rows = db.prepare('SELECT * FROM afk').all();
    for (const row of rows) {
      client.afk.set(row.user_id, { reason: row.reason, since: row.since });
    }
    console.log(`[AFK] Restored ${rows.length} AFK entries from DB.`);
  },

  handleMessage: async (client, message) => {
    if (message.author.bot || !client.afk) return;

    // --- Return from AFK (3-message buffer) ---
    if (client.afk.has(message.author.id)) {
      const count = (returnBuffer.get(message.author.id) || 0) + 1;

      if (count < 3) {
        returnBuffer.set(message.author.id, count);
      } else {
        client.afk.delete(message.author.id);
        returnBuffer.delete(message.author.id);
        db.prepare('DELETE FROM afk WHERE user_id = ?').run(message.author.id);

        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(SUCCESS_COLOR)
              .setDescription(`✅ Welcome back! Your AFK status has been removed.`)
          ]
        });
      }
      return;
    }

    // --- Notify when a pinged user is AFK ---
    if (!message.mentions.users.size) return;

    for (const [id, user] of message.mentions.users) {
      const afkData = client.afk.get(id);
      if (!afkData) continue;

      const msSince = Date.now() - afkData.since;
      const seconds = Math.floor(msSince / 1000) % 60;
      const minutes = Math.floor(msSince / (1000 * 60)) % 60;
      const hours   = Math.floor(msSince / (1000 * 60 * 60)) % 24;
      const days    = Math.floor(msSince / (1000 * 60 * 60 * 24));

      let timeStr = '';
      if (days)    timeStr += `${days}d `;
      if (hours)   timeStr += `${hours}h `;
      if (minutes) timeStr += `${minutes}m `;
      timeStr += `${seconds}s`;

      const embed = new EmbedBuilder()
        .setColor(AFK_COLOR)
        .setTitle('AFK Status')
        .setDescription(`🌙 | **${user.username}** is AFK. Reason: ${afkData.reason}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: `AFK for ${timeStr}` });

      await message.channel.send({ embeds: [embed] });
    }
  },
};