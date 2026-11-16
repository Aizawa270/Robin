'use strict';

const {
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Optional config for bot owner IDs
let config = null;

try {
  config = require('../../config');
} catch {}

// ---------- Universal permission helpers ----------

function getBotOwnerIds(client) {
  const ids = new Set();

  if (config?.ownerId) ids.add(String(config.ownerId));
  if (client?.ownerId) ids.add(String(client.ownerId));

  if (client?.ownerIds && Array.isArray(client.ownerIds)) {
    for (const id of client.ownerIds) {
      ids.add(String(id));
    }
  }

  if (process.env.OWNER_ID) {
    ids.add(String(process.env.OWNER_ID));
  }

  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

function hasStealPermission(client, member) {
  if (!member) return false;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (member.id === member.guild.ownerId) {
    return true;
  }

  if (isBotOwner(client, member.id)) {
    return true;
  }

  try {
    if (!client.staffaddDB) {
      initStaffAddDB(client);
    }

    const db = client.staffaddDB;

    if (!db) return false;

    const row = db.prepare(
      `SELECT 1 FROM staffadd_access
       WHERE guild_id = ?
       AND target_type = ?
       AND target_id = ?`
    ).get(member.guild.id, 'user', member.id);

    if (row) return true;

    const roleRows = db.prepare(
      `SELECT target_id FROM staffadd_access
       WHERE guild_id = ?
       AND target_type = ?`
    ).all(member.guild.id, 'role');

    for (const role of roleRows) {
      if (member.roles.cache.has(role.target_id)) {
        return true;
      }
    }
  } catch (error) {
    console.error('[Steal] Permission check failed:', error);
  }

  return false;
}

// ---------- Staff access database ----------

function initStaffAddDB(client) {
  if (client._staffaddReady) return;

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
  client._staffaddReady = true;
}

// ---------- Fetch helper ----------

const fetchFn = global.fetch;

async function downloadAsset(url, timeout = 15000) {
  if (typeof fetchFn !== 'function') {
    throw new Error('Global fetch is unavailable. Node.js 18+ is required.');
  }

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Download failed with HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (!buffer.length) {
      throw new Error('Downloaded asset is empty.');
    }

    return buffer;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------- Sticker extraction ----------

async function extractSticker(message, repliedMessage) {
  const sticker = repliedMessage.stickers.first();

  if (!sticker) return null;

  // Discord sticker format:
  // 1 = PNG
  // 2 = APNG
  // 3 = Lottie
  // 4 = GIF

  const format = Number(sticker.format);

  const extensions = {
    1: 'png',
    2: 'png',
    3: 'json',
    4: 'gif',
  };

  const extension = extensions[format];

  if (!extension) {
    return message.reply(
      'This sticker uses an unsupported format.'
    );
  }

  // GIF stickers use Discord's media proxy.
  const stickerUrl = format === 4
    ? `https://media.discordapp.net/stickers/${sticker.id}.gif`
    : `https://cdn.discordapp.com/stickers/${sticker.id}.${extension}`;

  let buffer;

  try {
    buffer = await downloadAsset(stickerUrl);
  } catch (error) {
    console.error('[Steal] Sticker download failed:', error);

    if (error.name === 'AbortError') {
      return message.reply(
        'The sticker download timed out. Please try again.'
      );
    }

    return message.reply(
      'I could not download that sticker. Its original asset might be unavailable.'
    );
  }

  const safeName = String(sticker.name || 'sticker')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40) || 'sticker';

  const filename = `${safeName}.${extension}`;

  const attachment = new AttachmentBuilder(buffer, {
    name: filename,
  });

  const sizeKB = (buffer.length / 1024).toFixed(1);

  const description = [
    `**Sticker:** ${sticker.name}`,
    `**Format:** ${extension.toUpperCase()}`,
    `**File size:** ${sizeKB} KB`,
    '',
    format === 3
      ? 'This is a Lottie sticker. The original JSON asset is attached instead of a rendered image.'
      : 'Original sticker asset attached. You can use it when uploading a server sticker.',
    buffer.length > 512 * 1024
      ? '\n⚠️ This file exceeds Discord\'s 512 KB sticker upload limit and may need compression.'
      : '',
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setColor('#22c55e')
    .setTitle('Sticker Extracted')
    .setDescription(description)
    .setFooter({
      text: `Requested by ${message.author.tag}`,
    })
    .setTimestamp();

  // Display image preview for image-based stickers.
  if (format !== 3) {
    embed.setImage(`attachment://${filename}`);
  }

  return message.reply({
    embeds: [embed],
    files: [attachment],
    allowedMentions: {
      repliedUser: false,
    },
  });
}

// ---------- Main command ----------

module.exports = {
  name: 'steal',

  aliases: ['stealemoji'],

  description: 'Extract emojis or stickers from replied messages.',

  category: 'admin',

  usage: '<emoji> [name] or reply to an emoji/sticker message',

  async execute(client, message, args) {
    if (!message.guild) return;

    const prefix = typeof client.getPrefix === 'function'
      ? client.getPrefix(message.guild.id)
      : '$';

    // Permission check
    if (!hasStealPermission(client, message.member)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription(
              'You do not have permission to use this command.'
            ),
        ],
      });
    }

    // ================================================
    // FETCH REPLIED MESSAGE
    // ================================================

    let repliedMsg = null;

    if (message.reference?.messageId) {
      try {
        repliedMsg = await message.channel.messages.fetch(
          message.reference.messageId
        );
      } catch (error) {
        console.error('[Steal] Could not fetch replied message:', error);
      }
    }

    // ================================================
    // STICKER EXTRACTION
    // ================================================

    if (repliedMsg?.stickers?.size > 0) {
      return extractSticker(message, repliedMsg);
    }

    // ================================================
    // EMOJI EXTRACTION
    // ================================================

    const emojiRegex = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>/g;

    let emojiData = null;

    // Check replied message first.
    if (repliedMsg) {
      const content = repliedMsg.content || '';
      const matches = [...content.matchAll(emojiRegex)];

      if (matches.length) {
        const match = matches[0];

        emojiData = {
          animated: match[1] === 'a',
          name: match[2],
          id: match[3],
        };
      }
    }

    // Check direct argument.
    if (!emojiData && args[0]) {
      const match = String(args[0]).match(
        /<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>/
      );

      if (match) {
        emojiData = {
          animated: match[1] === 'a',
          name: match[2],
          id: match[3],
        };
      }
    }

    if (!emojiData) {
      return message.reply(
        `Usage: \`${prefix}steal <emoji> [name]\` or reply to a message containing an emoji or sticker.`
      );
    }

    // ================================================
    // BOT PERMISSIONS
    // ================================================

    if (
      !message.guild.members.me?.permissions.has(
        PermissionFlagsBits.ManageGuildExpressions
      )
    ) {
      return message.reply(
        'I need **Manage Emojis and Stickers** permission to add emojis.'
      );
    }

    // ================================================
    // EMOJI LIMIT CHECK
    // ================================================

    let currentGuild;
    let emojiCache;

    try {
      currentGuild = await message.guild.fetch();
      emojiCache = await currentGuild.emojis.fetch();
    } catch (error) {
      console.error('[Steal] Emoji limit check failed:', error);

      return message.reply(
        'Could not check the server emoji slots. Please try again.'
      );
    }

    const emojiLimitsByTier = {
      0: 50,
      1: 100,
      2: 150,
      3: 250,
    };

    const tier = Number(currentGuild.premiumTier) || 0;
    const emojiLimit = emojiLimitsByTier[tier] ?? 50;

    const currentCount = emojiCache.filter(
      emoji => emoji.animated === emojiData.animated
    ).size;

    if (currentCount >= emojiLimit) {
      const emojiType = emojiData.animated
        ? 'animated'
        : 'static';

      return message.reply(
        `This server has reached its ${emojiType} emoji limit (${currentCount}/${emojiLimit}).`
      );
    }

    // ================================================
    // EMOJI NAME
    // ================================================

    let desiredName = args[1] || emojiData.name;

    desiredName = desiredName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .slice(0, 32);

    if (!/^[a-zA-Z0-9_]{2,32}$/.test(desiredName)) {
      return message.reply(
        'Name must be 2-32 characters (letters, numbers, underscores).'
      );
    }

    let finalName = desiredName;

    if (
      message.guild.emojis.cache.some(
        emoji => emoji.name.toLowerCase() === desiredName.toLowerCase()
      )
    ) {
      let suffix = 1;

      while (
        message.guild.emojis.cache.some(
          emoji =>
            emoji.name.toLowerCase() ===
            `${desiredName}_${suffix}`.toLowerCase()
        )
      ) {
        suffix++;
      }

      finalName = `${desiredName}_${suffix}`;
    }

    // ================================================
    // DOWNLOAD & CREATE EMOJI
    // ================================================

    const ext = emojiData.animated ? 'gif' : 'png';

    const emojiUrl =
      `https://cdn.discordapp.com/emojis/${emojiData.id}.${ext}`;

    try {
      const buffer = await downloadAsset(emojiUrl, 10000);

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
          {
            name: 'Name',
            value: `\`${created.name}\``,
            inline: true,
          },
          {
            name: 'ID',
            value: `\`${created.id}\``,
            inline: true,
          },
          {
            name: 'Animated',
            value: created.animated ? 'Yes' : 'No',
            inline: true,
          },
          {
            name: 'Usage',
            value: `\`${created}\` or \`:${created.name}:\``,
            inline: false,
          }
        )
        .setFooter({
          text: `Added by ${message.author.tag}`,
        })
        .setTimestamp();

      if (finalName !== desiredName) {
        embed.setDescription(
          `${created} added to the server.\n` +
          `*Renamed from \`${desiredName}\` to avoid a conflict.*`
        );
      }

      return message.reply({
        embeds: [embed],
      });

    } catch (error) {
      if (error.name === 'AbortError') {
        return message.reply(
          'The request timed out while trying to fetch the emoji.'
        );
      }

      console.error('[Steal] Emoji creation failed:', error);

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

      const description =
        errorMap[error.code] ||
        `Unexpected error: ${error.message}`;

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription(`Failed to add emoji: ${description}`),
        ],
      });
    }
  },
};