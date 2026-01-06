// commands/mod/notes.js
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
  name: 'notes',
  description: 'Show notes for a user. Usage: !notes <id|@user|username>',
  category: 'mod',
  usage: '!notes <user>',
  aliases: [],
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
        !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return;
    }

    const targetArg = args[0] || (message.mentions.users.first() ? `<@${message.mentions.users.first().id}>` : null);
    if (!targetArg) return message.reply('Usage: `!notes <id|@user|username>`');

    const targetId = resolveTargetId(message, targetArg);
    if (!targetId) return message.reply('Could not find that user.');

    const rows = db.prepare('SELECT id, moderator_id, note_text, created_at FROM notes WHERE target_id = ? ORDER BY created_at ASC').all(targetId);
    if (!rows || rows.length === 0) return message.reply('No notes found for that user.');

    // Build paginated or single embed with numbered lines
    const embed = new EmbedBuilder()
      .setTitle('🗒️ Notes')
      .setColor('#0369a1')
      .setDescription(`Notes for <@${targetId}> (ID: ${targetId})`);

    // assemble a readable list — numbered
    const lines = rows.map((r, idx) => {
      const date = `<t:${Math.floor(r.created_at/1000)}:f>`;
      const mod = `<@${r.moderator_id}>`;
      const text = r.note_text.length > 500 ? r.note_text.slice(0, 497) + '...' : r.note_text;
      return `**${idx+1}.** ${text}\n• By: ${mod} • ${date}`;
    });

    // Discord embed description length limit ~4096, keep within safe bounds
    const chunk = lines.join('\n\n').slice(0, 3800);
    embed.setDescription(`${embed.data.description}\n\n${chunk}`);

    return message.reply({ embeds: [embed] });
  }
};