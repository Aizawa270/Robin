// commands/mod/delnote.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'notes.sqlite'));
db.pragma('journal_mode = WAL');

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
  name: 'delnote',
  description: 'Delete a note by number. Usage: !delnote <id|@user|username> <noteNumber>',
  category: 'mod',
  usage: '!delnote <user> <noteNumber>',
  aliases: [],
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
        !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return;
    }

    const targetArg = args.shift();
    const numArg = args.shift();
    if (!targetArg || !numArg) return message.reply('Usage: `!delnote <user> <noteNumber>`');

    const targetId = resolveTargetId(message, targetArg);
    if (!targetId) return message.reply('Could not find that user.');

    const idx = parseInt(numArg, 10);
    if (isNaN(idx) || idx < 1) return message.reply('Invalid note number.');

    const rows = db.prepare('SELECT id FROM notes WHERE target_id = ? ORDER BY created_at ASC').all(targetId);
    if (!rows || rows.length < idx) return message.reply('Note number not found.');

    const row = rows[idx-1];
    db.prepare('DELETE FROM notes WHERE id = ?').run(row.id);

    const embed = new EmbedBuilder()
      .setTitle('Note Deleted')
      .setColor('#ef4444')
      .setDescription(`Deleted note #${idx} for <@${targetId}>.`);

    return message.reply({ embeds: [embed] });
  }
};