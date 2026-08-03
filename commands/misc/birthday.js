// commands/misc/birthday.js
const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ─── Optional config (bot owner) ─────────────────────────────
let config = null;
try { config = require('../../config'); } catch {}

// ─── Data folder and database ─────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'birthdays.sqlite'));
db.pragma('journal_mode = WAL');

// Create / update the birthdays table (now includes guild_id)
db.prepare(`
  CREATE TABLE IF NOT EXISTS birthdays (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    month INTEGER NOT NULL,
    last_sent_year INTEGER,
    PRIMARY KEY (guild_id, user_id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS birthday_channels (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL
  )
`).run();

// ─── Helpers ──────────────────────────────────────────────────
function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

async function resolveTargetUser(client, message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(input).catch(() => null);
  }

  const query = String(input).trim();
  if (!query) return null;

  const mention = query.match(/^<@!?(\d{15,20})>$/);
  if (mention) {
    return await client.users.fetch(mention[1]).catch(() => null);
  }

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  return null;
}

function formatBirthday(day, month) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

function getNextBirthdayDate(day, month) {
  const now = new Date();
  const year = now.getFullYear();
  let date = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (date.getTime() < now.getTime()) {
    date = new Date(year + 1, month - 1, day, 0, 0, 0, 0);
  }

  return date;
}

// ─── Bot owner detection (consistent with watchword.js) ─────
function getBotOwnerIds(client) {
  const ids = new Set();
  if (config?.ownerId) ids.add(String(config.ownerId));
  if (Array.isArray(config?.ownerIds)) {
    config.ownerIds.forEach(id => ids.add(String(id)));
  }
  if (client?.ownerId) ids.add(String(client.ownerId));
  if (Array.isArray(client?.ownerIds)) {
    client.ownerIds.forEach(id => ids.add(String(id)));
  }
  if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));
  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

// ─── Permissions for birthday channel setup ───────────────────
function canManageBirthdayChannel(client, message) {
  if (!message.guild || !message.member) return false;
  if (message.guild.ownerId === message.author.id) return true;
  if (isBotOwner(client, message.author.id)) return true;
  return false;
}

function getBirthdayChannelId(guildId) {
  return db.prepare(`
    SELECT channel_id
    FROM birthday_channels
    WHERE guild_id = ?
  `).get(guildId)?.channel_id || null;
}

// ─── Command ──────────────────────────────────────────────────
module.exports = {
  name: 'birthday',
  category: 'utility',
  usage: '$birthday [@user|id|username] | $birthday calendar | $birthdaychannel #channel',
  aliases: [],

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Birthday Failed', 'This command can only be used in a server.')]
      });
    }

    const sub = (args[0] || '').toLowerCase();

    if (sub === 'birthdaychannel' || sub === 'channel' || sub === 'setup') {
      if (!canManageBirthdayChannel(client, message)) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Birthday Setup Failed', 'Only the server owner or bot owner can set the birthday channel.')]
        });
      }

      const channelArg = args[1];
      if (!channelArg) {
        return message.reply({
          embeds: [makeEmbed('#f59e0b', 'Birthday Setup', 'Use `$birthdaychannel #channel` or `$birthdaychannel channel_id`.')]
        });
      }

      const raw = String(channelArg).trim().replace(/[<#>]/g, '');
      let channel = message.guild.channels.cache.get(raw);

      if (!channel && /^\d{15,20}$/.test(raw)) {
        channel = await message.guild.channels.fetch(raw).catch(() => null);
      }

      if (
        !channel ||
        (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
      ) {
        return message.reply({
          embeds: [makeEmbed('#f59e0b', 'Birthday Setup Failed', 'Provide a valid text channel or announcement channel.')]
        });
      }

      db.prepare(`
        INSERT OR REPLACE INTO birthday_channels (guild_id, channel_id)
        VALUES (?, ?)
      `).run(message.guild.id, channel.id);

      return message.reply({
        embeds: [
          makeEmbed(
            '#22c55e',
            'Birthday Channel Set',
            `Birthday announcements will now be sent in ${channel}.`
          )
        ]
      });
    }

    if (sub === 'calendar') {
      // Only show birthdays from members of this server
      const rows = db.prepare(`
        SELECT user_id, day, month
        FROM birthdays
        WHERE guild_id = ?
      `).all(message.guild.id);

      if (!rows.length) {
        return message.reply({
          embeds: [makeEmbed('#f59e0b', 'Birthday Calendar', 'No birthdays have been saved in this server yet.')]
        });
      }

      const upcoming = [];
      for (const row of rows) {
        const date = getNextBirthdayDate(row.day, row.month);
        upcoming.push({
          ...row,
          timestamp: date.getTime()
        });
      }

      upcoming.sort((a, b) => a.timestamp - b.timestamp);

      const lines = [];
      for (const row of upcoming.slice(0, 10)) {
        const user = await client.users.fetch(row.user_id).catch(() => null);
        const name = user?.username || row.user_id;
        lines.push(`**${name}** — ${formatBirthday(row.day, row.month)} — <t:${Math.floor(row.timestamp / 1000)}:R>`);
      }

      return message.reply({
        embeds: [makeEmbed('#38bdf8', 'Upcoming Birthdays', lines.join('\n'))]
      });
    }

    // View a user's birthday (only from this server)
    const target =
      message.mentions.users.first() ||
      (args[0] ? await resolveTargetUser(client, message, args[0]) : null) ||
      message.author;

    const row = db.prepare(`
      SELECT day, month
      FROM birthdays
      WHERE guild_id = ? AND user_id = ?
    `).get(message.guild.id, target.id);

    if (!row) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Birthday Not Set',
            target.id === message.author.id
              ? 'You have not set a birthday in this server.'
              : `**${target.username}** has not set a birthday in this server.`
          )
        ]
      });
    }

    return message.reply({
      embeds: [
        makeEmbed(
          '#f472b6',
          'Birthday',
          `**${target.username}**'s birthday is **${formatBirthday(row.day, row.month)}**`
        )
      ]
    });
  }
};