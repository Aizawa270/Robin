'use strict';

const {
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

// Optional config for bot owner IDs
let config = null;

try {
  config = require('../../config');
} catch {}

// ============================================================
// PERMISSION HELPERS
// ============================================================

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

    const row = db.prepare(`
      SELECT 1
      FROM staffadd_access
      WHERE guild_id = ?
        AND target_type = ?
        AND target_id = ?
    `).get(member.guild.id, 'user', member.id);

    if (row) return true;

    const roleRows = db.prepare(`
      SELECT target_id
      FROM staffadd_access
      WHERE guild_id = ?
        AND target_type = ?
    `).all(member.guild.id, 'role');

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

// ============================================================
// STAFF ACCESS DATABASE
// ============================================================

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

// ============================================================
// DOWNLOAD HELPER
// ============================================================

async function downloadAsset(url, timeout = 15000) {
  if (typeof global.fetch !== 'function') {
    throw new Error('Global fetch is unavailable. Node.js 18+ is required.');
  }

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await global.fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(
        `Asset download failed with HTTP ${response.status}.`
      );

      error.status = response.status;

      throw error;
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

// ============================================================
// APNG TO GIF CONVERSION
// ============================================================

function convertApngToGif(buffer) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',

      '-i', 'pipe:0',

      '-filter_complex',
      [
        'fps=15',
        'scale=320:320:force_original_aspect_ratio=decrease:flags=lanczos',
        'pad=320:320:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        'split[a][b]',
        '[a]palettegen=reserve_transparent=1[p]',
        '[b][p]paletteuse=alpha_threshold=128',
      ].join(','),

      '-loop', '0',
      '-f', 'gif',
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', args);

    const output = [];
    const errors = [];

    let finished = false;

    const finish = (callback, value) => {
      if (finished) return;

      finished = true;
      clearTimeout(timeout);

      callback(value);
    };

    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGKILL');

      finish(
        reject,
        new Error('APNG conversion timed out.')
      );
    }, 20000);

    ffmpeg.stdout.on('data', chunk => {
      output.push(chunk);
    });

    ffmpeg.stderr.on('data', chunk => {
      errors.push(chunk);
    });

    ffmpeg.on('error', error => {
      finish(reject, error);
    });

    ffmpeg.on('close', code => {
      if (finished) return;

      if (code !== 0) {
        return finish(
          reject,
          new Error(
            Buffer.concat(errors).toString() ||
            `FFmpeg exited with code ${code}.`
          )
        );
      }

      const gifBuffer = Buffer.concat(output);

      if (!gifBuffer.length) {
        return finish(
          reject,
          new Error('Generated GIF is empty.')
        );
      }

      finish(resolve, gifBuffer);
    });

    ffmpeg.stdin.on('error', () => {
      // The process may close its input while shutting down.
    });

    ffmpeg.stdin.end(buffer);
  });
}

// ============================================================
// STICKER EXTRACTION
// ============================================================

async function extractSticker(message, repliedMessage) {
  const sticker = repliedMessage.stickers.first();

  if (!sticker) return null;

  /*
   * Discord sticker formats:
   *
   * 1 = PNG
   * 2 = APNG (animated PNG)
   * 3 = Lottie JSON
   * 4 = GIF
   */

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

  // Discord uses a special media proxy URL for GIF stickers.
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
      'I could not download this sticker. Its original asset might be unavailable.'
    );
  }

  const safeName = String(sticker.name || 'sticker')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40) || 'sticker';

  const files = [];

  const embed = new EmbedBuilder()
    .setColor('#22c55e')
    .setTitle('Sticker Extracted')
    .setTimestamp();

  const description = [
    `**Sticker:** ${sticker.name}`,
    `**Original format:** ${extension.toUpperCase()}`,
    `**Original size:** ${(buffer.length / 1024).toFixed(1)} KB`,
  ];

  // ========================================================
  // APNG STICKERS
  // ========================================================

  if (format === 2) {
    const originalName = `${safeName}.png`;

    // Preserve original APNG for uploading.
    files.push(
      new AttachmentBuilder(buffer, {
        name: originalName,
      })
    );

    try {
      // Generate animated GIF for Discord's preview.
      const gifBuffer = await convertApngToGif(buffer);

      const gifName = `${safeName}_animated.gif`;

      files.push(
        new AttachmentBuilder(gifBuffer, {
          name: gifName,
        })
      );

      // Display the GIF in the embed.
      embed.setImage(`attachment://${gifName}`);

      description.push(
        '',
        '✅ Animated GIF preview generated.',
        '📁 Original APNG included for sticker uploading.',
        `**GIF preview size:** ${(gifBuffer.length / 1024).toFixed(1)} KB`
      );
    } catch (error) {
      console.error(
        '[Steal] APNG to GIF conversion failed:',
        error
      );

      description.push(
        '',
        '⚠️ GIF preview conversion failed.',
        'The original APNG is still attached.'
      );
    }

    if (buffer.length > 512 * 1024) {
      description.push(
        '',
        '⚠️ Original APNG exceeds the 512 KB sticker upload limit.'
      );
    }
  }

  // ========================================================
  // GIF STICKERS
  // ========================================================

  else if (format === 4) {
    const filename = `${safeName}.gif`;

    files.push(
      new AttachmentBuilder(buffer, {
        name: filename,
      })
    );

    embed.setImage(`attachment://${filename}`);

    description.push(
      '',
      '✅ Original animated GIF attached.'
    );

    if (buffer.length > 512 * 1024) {
      description.push(
        '',
        '⚠️ This file exceeds the 512 KB sticker upload limit.'
      );
    }
  }

  // ========================================================
  // STATIC PNG STICKERS
  // ========================================================

  else if (format === 1) {
    const filename = `${safeName}.png`;

    files.push(
      new AttachmentBuilder(buffer, {
        name: filename,
      })
    );

    embed.setImage(`attachment://${filename}`);

    description.push(
      '',
      'Static PNG sticker attached.'
    );
  }

  // ========================================================
  // LOTTIE STICKERS
  // ========================================================

  else if (format === 3) {
    const filename = `${safeName}.json`;

    files.push(
      new AttachmentBuilder(buffer, {
        name: filename,
      })
    );

    description.push(
      '',
      'Lottie animation JSON attached.',
      'This is the original animation data, not a rendered GIF.'
    );
  }

  embed.setDescription(description.join('\n'));

  embed.setFooter({
    text: `Requested by ${message.author.tag}`,
  });

  return message.reply({
    embeds: [embed],
    files,
    allowedMentions: {
      repliedUser: false,
    },
  });
}

// ============================================================
// MAIN COMMAND
// ============================================================

module.exports = {
  name: 'steal',

  aliases: ['stealemoji'],

  description: 'Extract emojis or stickers from replied messages.',

  category: 'admin',

  usage: '<emoji> [name] or reply to an emoji/sticker message',

  async execute(client, message, args) {
    if (!message.guild) return;

    const prefix = typeof client.getPrefix === 'function'
      ? client.getPrefix(message.guild.id) || '$'
      : '$';

    // ========================================================
    // PERMISSION CHECK
    // ========================================================

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

    // ========================================================
    // FETCH REPLIED MESSAGE
    // ========================================================

    let repliedMsg = null;

    if (message.reference?.messageId) {
      try {
        repliedMsg = await message.channel.messages.fetch(
          message.reference.messageId
        );
      } catch (error) {
        console.error(
          '[Steal] Could not fetch replied message:',
          error
        );
      }
    }

    // ========================================================
    // CHECK FOR STICKER FIRST
    // ========================================================

    if (repliedMsg?.stickers?.size > 0) {
      return extractSticker(message, repliedMsg);
    }

    // ========================================================
    // EMOJI EXTRACTION
    // ========================================================

    const emojiRegex =
      /<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>/g;

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

    // Check command argument.
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

    // ========================================================
    // BOT PERMISSIONS
    // ========================================================

    if (
      !message.guild.members.me?.permissions?.has(
        PermissionFlagsBits.ManageGuildExpressions
      )
    ) {
      return message.reply(
        'I need **Manage Emojis and Stickers** permission to add emojis.'
      );
    }

    // ========================================================
    // EMOJI LIMIT CHECK
    // ========================================================

    let currentGuild;
    let emojiCache;

    try {
      currentGuild = await message.guild.fetch();
      emojiCache = await currentGuild.emojis.fetch();
    } catch (error) {
      console.error(
        '[Steal] Emoji limit check failed:',
        error
      );

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

    // ========================================================
    // EMOJI NAME HANDLING
    // ========================================================

    let desiredName = args[1] || emojiData.name;

    desiredName = desiredName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .slice(0, 32);

    if (!/^[a-zA-Z0-9_]{2,32}$/.test(desiredName)) {
      return message.reply(
        'Name must be 2-32 characters (letters, numbers, underscores).'
      );
    }

    // Case-insensitive duplicate check and auto-rename.
    let finalName = desiredName;

    if (
      emojiCache.some(
        emoji =>
          emoji.name.toLowerCase() === desiredName.toLowerCase()
      )
    ) {
      let suffix = 1;

      while (
        emojiCache.some(
          emoji =>
            emoji.name.toLowerCase() ===
            `${desiredName}_${suffix}`.toLowerCase()
        )
      ) {
        suffix++;
      }

      finalName = `${desiredName}_${suffix}`;
    }

    // ========================================================
    // DOWNLOAD AND CREATE EMOJI
    // ========================================================

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

      console.error(
        '[Steal] Emoji creation failed:',
        error
      );

      if (error.status === 404) {
        return message.reply(
          'That emoji no longer exists or cannot be accessed.'
        );
      }

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
            .setDescription(
              `Failed to add emoji: ${description}`
            ),
        ],
      });
    }
  },
};