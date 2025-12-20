const Database = require('better-sqlite3');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
  initAutomod: (client) => {
    const DATA_DIR = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    const db = new Database(path.join(DATA_DIR, 'automod.sqlite'));
    client.automodDB = db;

    // ── TABLES ──
    db.prepare(`
      CREATE TABLE IF NOT EXISTS blacklist_words (
        guild_id TEXT,
        word TEXT,
        type TEXT, -- trigger or soft
        PRIMARY KEY (guild_id, word)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS automod_alert_roles (
        guild_id TEXT,
        id TEXT,
        type TEXT, -- user or role
        PRIMARY KEY (guild_id, id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS automod_channel (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT
      )
    `).run();

    // ── MESSAGE CREATE HOOK ──
    client.on('messageCreate', async (message) => {
      if (!message.guild || message.author.bot) return;

      const guildId = message.guild.id;
      const content = message.content.toLowerCase();

      // fetch blacklisted words
      const words = db.prepare('SELECT * FROM blacklist_words WHERE guild_id = ?').all(guildId);

      for (const w of words) {
        if (content.includes(w.word.toLowerCase())) {
          if (w.type === 'soft') {
            // just delete
            try { await message.delete(); } catch {}
          } else {
            // trigger automod
            // Step 2 will handle this fully (sending embed, pinging alert roles/users)
          }
          break;
        }
      }
    });

    console.log('Automod handler initialized.');
  }
};