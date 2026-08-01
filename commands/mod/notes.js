const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'notes.sqlite'));
db.pragma('journal_mode = WAL');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

async function resolveTargetUser(client, message, raw) {
  if (!raw) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(raw);
  }

  const query = String(raw).trim();
  if (!query) return null;

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    const member = message.guild.members.cache.find(mm =>
      mm?.displayName?.toLowerCase() === lowered ||
      mm?.user?.username?.toLowerCase() === lowered ||
      mm?.user?.globalName?.toLowerCase() === lowered
    );
    if (member?.user) return member.user;
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
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Notes Failed', 'This command can only be used in a server.')]
      });
    }

    if (
      !message.member?.permissions?.has(PermissionFlagsBits.ManageMessages) &&
      !message.member?.permissions?.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Notes Failed', 'You need **Manage Messages** or **Administrator** permission.')]
      });
    }

    const targetArg = args[0] || (message.mentions.users.first() ? `<@${message.mentions.users.first().id}>` : null);
    if (!targetArg) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Notes Usage', '`!notes <id|@user|username>`')]
      });
    }

    const targetUser = await resolveTargetUser(client, message, targetArg);
    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'User Not Found', 'Could not find that user. Try a mention, ID, username, or display name.')]
      });
    }

    const rows = db.prepare(
      'SELECT id, moderator_id, note_text, created_at FROM notes WHERE target_id = ? ORDER BY created_at ASC'
    ).all(targetUser.id);

    if (!rows || rows.length === 0) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'No Notes Found', 'No notes found for that user.')]
      });
    }

    const userDisplay = targetUser.tag || targetUser.username || `User ${targetUser.id}`;

    const lines = rows.map((r, idx) => {
      const date = `<t:${Math.floor(r.created_at / 1000)}:f>`;
      const mod = `<@${r.moderator_id}>`;
      const text = r.note_text.length > 500 ? r.note_text.slice(0, 497) + '...' : r.note_text;
      return `**${idx + 1}.** ${text}\n• By: ${mod} • ${date}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🗒️ Notes')
      .setColor('#0369a1')
      .setDescription(`Notes for **${userDisplay}**\n\n${lines.join('\n\n').slice(0, 3800)}`)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};