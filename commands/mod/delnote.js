// commands/mod/delnote.js
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

async function resolveTargetUser(message, raw) {
  if (!raw) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(raw);
  }

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
  name: 'delnote',
  description: 'Delete a note by number. Usage: !delnote <id|@user|username> <noteNumber>',
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
        embeds: [makeEmbed('#f59e0b', 'User Not Found', 'Could not find that user. Try a mention, ID, username, or display name.')]
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