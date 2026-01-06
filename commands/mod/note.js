// commands/mod/note.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'notes.sqlite'));
db.pragma('journal_mode = WAL');

db.prepare(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    note_text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`).run();

function resolveTargetId(message, raw) {
  if (!raw) return null;
  const mention = message.mentions.users.first();
  if (mention) return mention.id;

  if (/^\d+$/.test(raw)) return raw;

  if (message.guild) {
    const lowered = raw.toLowerCase();
    const m = message.guild.members.cache.find(mm =>
      (mm.user.username && mm.user.username.toLowerCase() === lowered) ||
      (mm.displayName && mm.displayName.toLowerCase() === lowered)
    );
    if (m) return m.user.id;
  }

  return null;
}

module.exports = {
  name: 'note',
  description: 'Add a moderation note to a user. Usage: !note <id|@user|username> <note...>',
  category: 'mod',
  usage: '!note <user> <note>',
  aliases: [],
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
        !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return;
    }

    const targetArg = args.shift();
    if (!targetArg) return message.reply('Usage: `!note <id|@user|username> <note...>`');

    const targetId = resolveTargetId(message, targetArg);
    if (!targetId) return message.reply('Could not find that user.');

    const noteText = args.join(' ').trim();
    if (!noteText) return message.reply('Provide the note text.');

    const now = Date.now();
    db.prepare(`INSERT INTO notes (target_id, moderator_id, note_text, created_at) VALUES (?, ?, ?, ?)`)
      .run(targetId, message.author.id, noteText, now);

    // Fetch user for clean display
    const user = await client.users.fetch(targetId).catch(() => null);
    const userDisplay = user ? user.tag : 'Unknown User';

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle('🗒️ Note Added')
      .setColor('#f59e0b')
      .addFields(
        { name: 'User', value: userDisplay, inline: false },
        { name: 'By', value: message.author.tag, inline: true },
        { name: 'Note', value: noteText, inline: false },
        { name: 'Date', value: `<t:${Math.floor(now / 1000)}:f>`, inline: true }
      );

    return message.reply({ embeds: [embed] });
  }
};