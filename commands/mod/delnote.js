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

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

async function resolveTargetUser(message, raw) {
  if (!raw) return null;

  const query = String(raw).trim();
  if (!query) return null;

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = message.client.users.cache.get(id);
    if (cached) return cached;
    return await message.client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = message.client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    const cachedMember = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered
    );
    if (cachedMember?.user) return cachedMember.user;

    const fetched = await message.guild.members.fetch().catch(() => null);
    if (fetched?.size) {
      const exact = fetched.find(m =>
        m?.user?.username?.toLowerCase() === lowered
      );
      if (exact?.user) return exact.user;
    }
  }

  return null;
}

module.exports = {
  name: 'delnote',
  description: 'Delete a note by number. Usage: !delnote <user> <noteNumber>',
  category: 'mod',
  usage: '!delnote <user> <noteNumber>',
  aliases: [],
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Delnote Failed', 'This command can only be used in a server.')]
      });
    }

    if (
      !message.member?.permissions?.has(PermissionFlagsBits.ManageMessages) &&
      !message.member?.permissions?.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Delnote Failed', 'You need **Manage Messages** or **Administrator** permission.')]
      });
    }

    const targetArg = args.shift();
    const numArg = args.shift();

    if (!targetArg || !numArg) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Delnote Usage',
            '`!delnote <user> <noteNumber>`'
          )
        ]
      });
    }

    const targetUser = await resolveTargetUser(message, targetArg);
    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'User Not Found', 'Could not find that user. Try a mention, ID, or exact username.')]
      });
    }

    const idx = parseInt(numArg, 10);
    if (isNaN(idx) || idx < 1) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Invalid Note Number', 'Note number must be a number greater than 0.')]
      });
    }

    const rows = db.prepare(
      'SELECT id FROM notes WHERE target_id = ? ORDER BY created_at ASC'
    ).all(targetUser.id);

    if (!rows || rows.length < idx) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Note Not Found', 'That note number does not exist for this user.')]
      });
    }

    const row = rows[idx - 1];
    db.prepare('DELETE FROM notes WHERE id = ?').run(row.id);

    const embed = new EmbedBuilder()
      .setTitle('Note Deleted')
      .setColor('#ef4444')
      .setDescription(`Deleted note #${idx} for <@${targetUser.id}>.`)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};