const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Optional config for bot owner IDs (same as your other commands)
let config = null;
try { config = require('../../config'); } catch {}

// ---------- Universal permission helpers ----------
function getBotOwnerIds(client) {
  const ids = new Set();
  if (config?.ownerId) ids.add(String(config.ownerId));
  if (client?.ownerId) ids.add(String(client.ownerId));
  if (client?.ownerIds && Array.isArray(client.ownerIds)) {
    for (const id of client.ownerIds) ids.add(String(id));
  }
  if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));
  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

/**
 * Unified permission check:
 * - Administrator
 * - Server Owner
 * - Bot Owner
 * - OR has an entry in the staffadd_access table (initialised here if needed)
 *
 * TODO: once you centralize permissions, replace this with the shared helper.
 */
function hasStealPermission(client, member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === member.guild.ownerId) return true;
  if (isBotOwner(client, member.id)) return true;

  try {
    if (!client.staffaddDB) initStaffAddDB(client);
    const db = client.staffaddDB;
    if (!db) return false;

    const row = db.prepare(
      'SELECT 1 FROM staffadd_access WHERE guild_id = ? AND target_type = ? AND target_id = ?'
    ).get(member.guild.id, 'user', member.id);
    if (row) return true;

    const roleRows = db.prepare(
      'SELECT target_id FROM staffadd_access WHERE guild_id = ? AND target_type = ?'
    ).all(member.guild.id, 'role');
    for (const r of roleRows) {
      if (member.roles.cache.has(r.target_id)) return true;
    }
  } catch (_) {
    // ignore
  }
  return false;
}

// Lazy init for the staffadd DB (creates tables and data folder if needed)
function initStaffAddDB(client) {
  if (client._staffaddReady) return;
  client._staffaddReady = true;

  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'staffadd.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.prepare(`
    CREATE TABLE IF NOT EXISTS staffadd_settings (
      guild_id TEXT PRIMARY KEY,
      roles TEXT NOT NULL
    )
  `).run();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS staffadd_access (
      guild_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, target_type, target_id)
    )
  `).run();

  client.staffaddDB = db;
}
// ----------------------------------------------------

// We assume Node 18+ so global fetch is always available.
const fetchFn = global.fetch;

module.exports = {
  name: 'steal',
  aliases: ['stealemoji'],
  description: 'Steal an emoji from another server.',
  category: 'admin',
  usage: '<emoji> [name]  (or reply to a message containing an emoji)',
  async execute(client, message, args) {
    if (!message.guild) return;
    const prefix = client.getPrefix(message.guild.id);

    // Permission check (unified)
    if (!hasStealPermission(client, message.member)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You do not have permission to use this command.')
        ]
      });
    }

    // Bot permissions
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return message.reply('I need **Manage Emojis and Stickers** permission.');
    }

    // ---------- Extract emoji data ----------
    const emojiRegex = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>/g;
    let emojiData = null;

    // 1) Try to get from replied message (first emoji only)
    if (message.reference) {
      try {
        const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
        const content = repliedMsg.content || '';
        const matches = [...content.matchAll(emojiRegex)];
        if (matches.length) {
          const m = matches[0];
          emojiData = {
            animated: m[1] === 'a',
            name: m[2],
            id: m[3]
          };
        }
      } catch {}
    }

    // 2) If not found, try direct argument
    if (!emojiData && args[0]) {
      const m = args[0].match(/<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>/);
      if (m) {
        emojiData = {
          animated: m[1] === 'a',
          name: m[2],
          id: m[3]
        };
      }
    }

    if (!emojiData) {
      return message.reply(
        `Usage: \`${prefix}steal <emoji> [name]\` or reply to a message containing an emoji.`
      );
    }

    // ---------- Emoji limit check (static vs. animated) ----------
    await message.guild.emojis.fetch();

    if (emojiData.animated) {
      const animatedLimit = message.guild.animatedEmojiLimit ?? 50;
      const currentAnimated = message.guild.emojis.cache.filter(e => e.animated).size;
      if (currentAnimated >= animatedLimit) {
        return message.reply(`This server has reached the animated emoji limit (${animatedLimit}).`);
      }
    } else {
      const staticLimit = message.guild.staticEmojiLimit ?? 50;
      const currentStatic = message.guild.emojis.cache.filter(e => !e.animated).size;
      if (currentStatic >= staticLimit) {
        return message.reply(`This server has reached the static emoji limit (${staticLimit}).`);
      }
    }

    // ---------- Name handling ----------
    let desiredName = args[1] || emojiData.name;
    desiredName = desiredName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(desiredName)) {
      return message.reply('Name must be 2-32 characters (letters, numbers, underscores).');
    }

    // Case‑insensitive duplicate check + auto rename
    let finalName = desiredName;
    if (message.guild.emojis.cache.some(e => e.name.toLowerCase() === desiredName.toLowerCase())) {
      let suffix = 1;
      while (
        message.guild.emojis.cache.some(
          e => e.name.toLowerCase() === `${desiredName}_${suffix}`.toLowerCase()
        )
      ) {
        suffix++;
      }
      finalName = `${desiredName}_${suffix}`;
    }

    // ---------- Download & create emoji ----------
    const ext = emojiData.animated ? 'gif' : 'png';
    const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiData.id}.${ext}`;

    try {
      // Timeout protection (10 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const response = await fetchFn(emojiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          return message.reply('That emoji no longer exists or cannot be accessed.');
        }
        return message.reply('Failed to download the emoji image.');
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      const created = await message.guild.emojis.create({
        attachment: buffer,
        name: finalName,
        reason: `Added by ${message.author.tag}`,
      });

      await message.guild.emojis.fetch();

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Emoji Added Successfully')
        .setDescription(`${created} added to the server.`)
        .setThumbnail(emojiUrl)
        .addFields(
          { name: 'Name', value: `\`${created.name}\``, inline: true },
          { name: 'ID', value: `\`${created.id}\``, inline: true },
          { name: 'Animated', value: created.animated ? 'Yes' : 'No', inline: true },
          { name: 'Usage', value: `\`${created}\` or \`:${created.name}:\``, inline: false }
        )
        .setFooter({ text: `Added by ${message.author.tag}` })
        .setTimestamp();

      if (finalName !== desiredName) {
        embed.setDescription(
          `${created} added to the server.\n*Renamed from \`${desiredName}\` to avoid a conflict.*`
        );
      }

      return message.reply({ embeds: [embed] });
    } catch (error) {
      if (error.name === 'AbortError') {
        return message.reply('The request timed out while trying to fetch the emoji.');
      }

      console.error('Steal error:', error);

      // Custom handling for animated emoji upload failures (often code 50035)
      if (error.code === 50035 && emojiData.animated) {
        return message.reply(
          'Failed to add the animated emoji. Make sure this server supports animated emojis and has available slots.'
        );
      }

      const errorMap = {
        50013: 'Missing permissions.',
        30008: 'Emoji limit reached.',
        10014: 'Unknown emoji.',
        50035: 'Invalid emoji or not accessible.',
        50001: 'Missing access.',
      };

      const desc = errorMap[error.code] || `Unexpected error: ${error.message}`;
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription(`Failed to add emoji: ${desc}`)
        ]
      });
    }
  },
};