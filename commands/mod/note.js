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
  name: 'note',
  description: 'Add a moderation note to a user. Usage: !note <user> <note...>',
  category: 'mod',
  usage: '!note <user> <note>',
  aliases: [],
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Note Failed', 'This command can only be used in a server.')]
      });
    }

    if (
      !message.member?.permissions?.has(PermissionFlagsBits.ManageMessages) &&
      !message.member?.permissions?.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Note Failed', 'You need **Manage Messages** or **Administrator** permission.')]
      });
    }

    const targetArg = args.shift();
    if (!targetArg) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Note Usage', '`!note <user> <note...>`')]
      });
    }

    const targetUser = await resolveTargetUser(message, targetArg);
    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'User Not Found', 'Could not find that user. Try a mention, ID, or exact username.')]
      });
    }

    const noteText = args.join(' ').trim();
    if (!noteText) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Missing Note', 'Provide the note text.')]
      });
    }

    const now = Date.now();
    db.prepare(`INSERT INTO notes (target_id, moderator_id, note_text, created_at) VALUES (?, ?, ?, ?)`)
      .run(targetUser.id, message.author.id, noteText, now);

    const userDisplay = targetUser.tag || targetUser.username || `User ${targetUser.id}`;

    const embed = new EmbedBuilder()
      .setTitle('🗒️ Note Added')
      .setColor('#f59e0b')
      .addFields(
        { name: 'User', value: userDisplay, inline: false },
        { name: 'By', value: message.author.tag, inline: true },
        { name: 'Note', value: noteText, inline: false },
        { name: 'Date', value: `<t:${Math.floor(now / 1000)}:f>`, inline: true }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};