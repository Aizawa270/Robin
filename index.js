require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
} = require('discord.js');

const {
  loadCommands,
  handleMessage,
} = require('./handlers/commandHandler');

const messageTracker = require('./handlers/messageTracker');
const economy = require('./handlers/economy');
const shopSystem = require('./handlers/shopSystem');
const Database = require('better-sqlite3');

// ===== SERVICES =====
const birthdayService = require('./handlers/birthdayService');
const welcomeHandler = require('./handlers/welcomeHandler');

// ===== AFK MODULE =====
const afkModule = require('./commands/utility/afk');

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
});

// ===== DATA FOLDER =====
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ===== DATABASES =====

// Prefixless DB
const prefixlessDB = new Database(
  path.join(DATA_DIR, 'prefixless.sqlite')
);

prefixlessDB.pragma('journal_mode = WAL');

// Per-server prefixless table
prefixlessDB.prepare(`
  CREATE TABLE IF NOT EXISTS prefixless_guild (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  )
`).run();

client.prefixlessDB = prefixlessDB;
client.prefixlessByGuild = new Map();

for (const row of prefixlessDB
  .prepare('SELECT guild_id, user_id FROM prefixless_guild')
  .all()) {

  const guildId = String(row.guild_id);
  const userId = String(row.user_id);

  if (!client.prefixlessByGuild.has(guildId)) {
    client.prefixlessByGuild.set(guildId, new Set());
  }

  client.prefixlessByGuild.get(guildId).add(userId);
}

client.isPrefixless = (guildId, userId) => {
  if (!guildId || !userId) return false;

  return (
    client.prefixlessByGuild
      .get(String(guildId))
      ?.has(String(userId)) ?? false
  );
};

// Bot Blacklist
prefixlessDB.prepare(`
  CREATE TABLE IF NOT EXISTS bot_blacklist (
    user_id TEXT PRIMARY KEY
  )
`).run();

client.botBlacklist = new Set(
  prefixlessDB
    .prepare('SELECT user_id FROM bot_blacklist')
    .all()
    .map(row => row.user_id)
);

console.log(
  `[BotBlacklist] Loaded ${client.botBlacklist.size} entries`
);

// ===== QUARANTINE DB =====
const quarantineDB = new Database(
  path.join(DATA_DIR, 'quarantine.sqlite')
);

quarantineDB.pragma('journal_mode = WAL');

quarantineDB.prepare(`
  CREATE TABLE IF NOT EXISTS quarantine (
    user_id TEXT PRIMARY KEY,
    roles TEXT
  )
`).run();

quarantineDB.prepare(`
  CREATE TABLE IF NOT EXISTS quarantine_settings (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    role_id TEXT NOT NULL
  )
`).run();

quarantineDB.prepare(`
  CREATE TABLE IF NOT EXISTS quarantine_access (
    guild_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, target_type, target_id)
  )
`).run();

client.quarantineDB = quarantineDB;

// ===== GIVEAWAYS DB =====
const giveawayDB = new Database(
  path.join(DATA_DIR, 'giveaways.sqlite')
);

giveawayDB.pragma('journal_mode = WAL');

giveawayDB.prepare(`
  CREATE TABLE IF NOT EXISTS giveaways (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT,
    name TEXT,
    winner_count INTEGER,
    end_timestamp INTEGER
  )
`).run();

client.giveawayDB = giveawayDB;

// ===== PREFIX DB =====
const prefixDB = new Database(
  path.join(DATA_DIR, 'prefixes.sqlite')
);

prefixDB.pragma('journal_mode = WAL');

prefixDB.prepare(`
  CREATE TABLE IF NOT EXISTS prefixes (
    guild_id TEXT PRIMARY KEY,
    prefix TEXT
  )
`).run();

client.prefixDB = prefixDB;

// ===== FAME DATABASE =====
// Guild-based fame system: separate stats per server
const fameDB = new Database(
  path.join(DATA_DIR, 'fame.sqlite')
);

fameDB.pragma('journal_mode = WAL');
fameDB.pragma('synchronous = NORMAL');

fameDB.prepare(`
  CREATE TABLE IF NOT EXISTS fame_points_guild (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reputation INTEGER DEFAULT 0,
    stupidity INTEGER DEFAULT 0,
    black INTEGER DEFAULT 0,
    last_updated INTEGER DEFAULT (strftime('%s','now')*1000),
    PRIMARY KEY (guild_id, user_id)
  )
`).run();

fameDB.prepare(`
  CREATE TABLE IF NOT EXISTS fame_logs_guild (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    giver_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    point_type TEXT NOT NULL,
    timestamp INTEGER DEFAULT (strftime('%s','now')*1000)
  )
`).run();

fameDB.prepare(`
  CREATE TABLE IF NOT EXISTS fame_cooldowns_guild (
    guild_id TEXT NOT NULL,
    giver_id TEXT NOT NULL,
    point_type TEXT NOT NULL,
    last_given INTEGER NOT NULL,
    PRIMARY KEY (guild_id, giver_id, point_type)
  )
`).run();

client.fameDB = fameDB;

console.log('[Fame] Database initialized');

// ===== WATCHWORD DATABASE =====
const watchwordDB = new Database(
  path.join(DATA_DIR, 'watchwords.sqlite')
);

watchwordDB.pragma('journal_mode = WAL');

watchwordDB.prepare(`
  CREATE TABLE IF NOT EXISTS watchwords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    word TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')*1000),
    UNIQUE(user_id, guild_id, word)
  )
`).run();

client.watchwordDB = watchwordDB;

console.log('[Watchword] Database initialized');

// ===== AUTOMOD + MODSTATS + MODLOGS =====
const automodDB = new Database(
  path.join(DATA_DIR, 'automod.sqlite')
);

automodDB.pragma('journal_mode = WAL');
automodDB.pragma('synchronous = NORMAL');

automodDB.prepare(`
  CREATE TABLE IF NOT EXISTS automod_channel (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT
  )
`).run();

automodDB.prepare(`
  CREATE TABLE IF NOT EXISTS automod_alert_list (
    guild_id TEXT,
    target_type TEXT,
    target_id TEXT,
    PRIMARY KEY (guild_id, target_type, target_id)
  )
`).run();

automodDB.prepare(`
  CREATE TABLE IF NOT EXISTS blacklist_hard (
    guild_id TEXT,
    word TEXT,
    PRIMARY KEY (guild_id, word)
  )
`).run();

automodDB.prepare(`
  CREATE TABLE IF NOT EXISTS blacklist_soft (
    guild_id TEXT,
    word TEXT,
    PRIMARY KEY (guild_id, word)
  )
`).run();

automodDB.prepare(`
  CREATE TABLE IF NOT EXISTS automod_warns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    user_id TEXT,
    moderator_id TEXT,
    reason TEXT,
    timestamp INTEGER
  )
`).run();

automodDB.prepare(`
  CREATE TABLE IF NOT EXISTS automod_warn_counts (
    guild_id TEXT,
    user_id TEXT,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  )
`).run();

automodDB.prepare(`
  CREATE TABLE IF NOT EXISTS modstats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    moderator_id TEXT,
    target_id TEXT,
    action_type TEXT,
    reason TEXT,
    duration TEXT,
    timestamp INTEGER
  )
`).run();

automodDB.prepare(`
  CREATE TABLE IF NOT EXISTS modlogs_channel (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL
  )
`).run();

client.automodDB = automodDB;
client.modstatsDB = automodDB;

// ===== BATTLES DB =====
const battleDB = new Database(
  path.join(DATA_DIR, 'battles.sqlite')
);

battleDB.pragma('journal_mode = WAL');
battleDB.pragma('synchronous = NORMAL');

battleDB.prepare(`
  CREATE TABLE IF NOT EXISTS ongoing_battles (
    channel_id TEXT PRIMARY KEY,
    user1_id TEXT,
    user2_id TEXT,
    start_timestamp INTEGER
  )
`).run();

client.battleDB = battleDB;

// ===== SPY LOBBIES DB =====
const spyDB = new Database(
  path.join(DATA_DIR, 'spy.sqlite')
);

spyDB.pragma('journal_mode = WAL');
spyDB.pragma('synchronous = NORMAL');

spyDB.prepare(`
  CREATE TABLE IF NOT EXISTS spy_lobbies (
    lobby_id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL UNIQUE,
    host_id TEXT NOT NULL,
    channel_id TEXT,
    spy_channel_id TEXT,
    secret_word TEXT,
    status TEXT NOT NULL DEFAULT 'lobby',
    round INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')*1000)
  )
`).run();

spyDB.prepare(`
  CREATE TABLE IF NOT EXISTS spy_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lobby_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    alive INTEGER DEFAULT 1,
    is_spy INTEGER DEFAULT 0,
    joined_at INTEGER DEFAULT (strftime('%s','now')*1000),
    FOREIGN KEY(lobby_id) REFERENCES spy_lobbies(lobby_id)
      ON DELETE CASCADE
  )
`).run();

client.spyDB = spyDB;

// ===== MEMORY MAPS =====
client.afk = new Map();
client.snipes = new Map();
client.snipesImage = new Map();
client.edits = new Map();
client.reactionSnipes = new Map();
client.giveaways = new Map();
client.blacklistCache = new Map();

// ===== PREFIX FUNCTION =====
client.getPrefix = (guildId) => {
  if (!guildId) return '$';

  const row = client.prefixDB
    .prepare('SELECT prefix FROM prefixes WHERE guild_id = ?')
    .get(guildId);

  return row?.prefix || '$';
};

// ============================================================
// TIKTOK VIDEO DOWNLOADER
// Automatically detects TikTok links and uploads the video.
//
// Successful messages contain only the video attachment.
// Uses Node.js built-in fetch; no additional npm package.
// ============================================================

const tiktokDownloadsInProgress = new Set();

function getTikTokUploadLimit(message) {
  const MiB = 1024 * 1024;
  const tier = Number(message.guild?.premiumTier || 0);

  // Conservative limits to reduce Discord upload failures.
  // Videos above the selected limit receive an error.
  return tier >= 2 ? 24 * MiB : 9 * MiB;
}

async function readTikTokResponse(response, maxBytes) {
  const contentLength = Number(
    response.headers.get('content-length')
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > 0 &&
    contentLength > maxBytes
  ) {
    if (response.body) {
      await response.body.cancel().catch(() => {});
    }

    const error = new Error(
      'TikTok video exceeds the upload limit.'
    );

    error.code = 'TIKTOK_TOO_LARGE';

    throw error;
  }

  if (!response.body) {
    throw new Error('The video response contained no data.');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});

        const error = new Error(
          'TikTok video exceeds the upload limit.'
        );

        error.code = 'TIKTOK_TOO_LARGE';

        throw error;
      }

      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }

  if (totalBytes === 0) {
    throw new Error('The downloaded video was empty.');
  }

  return Buffer.concat(chunks, totalBytes);
}

async function handleTikTokPreview(message) {
  if (!message.guild || !message.content) return;

  // Find URLs in the message.
  const urls = message.content.match(
    /https?:\/\/[^\s<>]+/gi
  );

  if (!urls) return;

  let originalUrl = null;

  for (const rawUrl of urls) {
    // Remove punctuation accidentally included after the URL.
    const cleanedUrl = rawUrl.replace(/[.,!?;:)\]]+$/, '');

    try {
      const parsed = new URL(cleanedUrl);
      const hostname = parsed.hostname.toLowerCase();

      // Accept TikTok and its subdomains only.
      if (
        hostname !== 'tiktok.com' &&
        !hostname.endsWith('.tiktok.com')
      ) {
        continue;
      }

      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        continue;
      }

      originalUrl = parsed;
      break;
    } catch {
      continue;
    }
  }

  if (!originalUrl) return;

  // Identify duplicate downloads of the same video.
  const lockKey = `${message.guild.id}:${originalUrl.pathname}`;

  if (tiktokDownloadsInProgress.has(lockKey)) {
    return;
  }

  // Avoid downloading too many videos simultaneously.
  if (tiktokDownloadsInProgress.size >= 3) {
    return;
  }

  tiktokDownloadsInProgress.add(lockKey);

  const maxBytes = getTikTokUploadLimit(message);
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 30000);

  // Avoid keeping the process alive just because of this timeout.
  timeout.unref?.();

  try {
    // Convert the TikTok URL into TikTokFix direct-media mode.
    //
    // Example:
    // www.tiktok.com/@user/video/123
    // becomes:
    // www.tiktokfix.com/@user/video/123?isDirect=true
    //
    // TikTokFix documents ?isDirect=true for raw media access.

    const directUrl = new URL(originalUrl.toString());

    directUrl.protocol = 'https:';

    directUrl.hostname = directUrl.hostname.replace(
      /tiktok\.com$/i,
      'tiktokfix.com'
    );

    directUrl.port = '';
    directUrl.username = '';
    directUrl.password = '';
    directUrl.hash = '';

    // Remove TikTok tracking parameters.
    directUrl.search = '';
    directUrl.searchParams.set('isDirect', 'true');

    console.log(
      `[TikTok] Downloading video from ${message.author.tag}`
    );

    const response = await fetch(directUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,

      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; VanessaDiscordBot/1.0)',

        Accept:
          'video/mp4, video/*, application/octet-stream, */*',
      },
    });

    if (!response.ok) {
      if (response.body) {
        await response.body.cancel().catch(() => {});
      }

      throw new Error(
        `TikTokFix returned HTTP ${response.status}.`
      );
    }

    const contentType = (
      response.headers.get('content-type') || ''
    )
      .split(';')[0]
      .trim()
      .toLowerCase();

    // Only accept MP4 or generic binary responses.
    // Never upload an HTML preview page as a video.
    if (
      contentType !== 'video/mp4' &&
      contentType !== 'application/octet-stream'
    ) {
      if (response.body) {
        await response.body.cancel().catch(() => {});
      }

      throw new Error(
        `Unsupported media type: ${contentType || 'unknown'}.`
      );
    }

    // Download the video while enforcing the size limit.
    const videoBuffer = await readTikTokResponse(
      response,
      maxBytes
    );

    // Validate the MP4 signature.
    if (
      videoBuffer.length < 12 ||
      videoBuffer.toString('ascii', 4, 8) !== 'ftyp'
    ) {
      throw new Error(
        'The response is not a valid MP4 file.'
      );
    }

    console.log(
      `[TikTok] Downloaded ${(videoBuffer.length / 1048576).toFixed(2)} MiB`
    );

    // Send ONLY the video file.
    // No reply text, URL, or embed description is included.
    await message.channel.send({
      files: [
        {
          attachment: videoBuffer,
          name: 'tiktok.mp4',
        },
      ],
      allowedMentions: {
        parse: [],
      },
    });

    console.log('[TikTok] Video uploaded successfully.');

  } catch (error) {
    console.error('[TikTok] Conversion failed:', error);

    let errorMessage;

    if (
      error.name === 'AbortError' ||
      error.name === 'TimeoutError'
    ) {
      errorMessage =
        '❌ TikTok download timed out. Please try again later.';
    } else if (error.code === 'TIKTOK_TOO_LARGE') {
      errorMessage =
        '❌ This TikTok is too large for Vanessa to upload directly.';
    } else {
      errorMessage =
        '❌ Vanessa could not retrieve this TikTok video. It may be private, unavailable, or unsupported.';
    }

    // Only send text when conversion fails.
    await message.channel.send({
      content: errorMessage,
      allowedMentions: {
        parse: [],
      },
    }).catch(sendError => {
      console.error(
        '[TikTok] Failed to send error message:',
        sendError
      );
    });

  } finally {
    clearTimeout(timeout);
    tiktokDownloadsInProgress.delete(lockKey);
  }
}

// ===== READY EVENT =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: ':3',
        type: ActivityType.Playing,
      },
    ],
    status: 'dnd',
  });

  console.log('[Status] Set to: .gg/hanging');

  economy.init(client);
  shopSystem.init(client);

  await messageTracker.init(client);

  birthdayService(client);
  welcomeHandler(client);

  afkModule.restoreAfk(client);

  try {
    const guilds = automodDB.prepare(`
      SELECT DISTINCT guild_id FROM blacklist_hard
      UNION
      SELECT DISTINCT guild_id FROM blacklist_soft
    `).all();

    for (const { guild_id } of guilds) {
      const hard = automodDB
        .prepare(
          'SELECT word FROM blacklist_hard WHERE guild_id = ?'
        )
        .all(guild_id)
        .map(row => row.word);

      const soft = automodDB
        .prepare(
          'SELECT word FROM blacklist_soft WHERE guild_id = ?'
        )
        .all(guild_id)
        .map(row => row.word);

      client.blacklistCache.set(guild_id, {
        hard,
        soft,
      });
    }

    console.log(
      `[Blacklist] Loaded for ${client.blacklistCache.size} guilds`
    );
  } catch (error) {
    console.error('[Blacklist] Cache failed:', error);
  }

  try {
    const automod = require('./handlers/automodHandler');

    if (automod?.initAutomod) {
      automod.initAutomod(client);
    }
  } catch (error) {
    console.error('Automod init failed:', error);
  }

  try {
    const startGiveaway = require('./commands/startgiveaway');

    const all = giveawayDB
      .prepare('SELECT * FROM giveaways')
      .all();

    for (const giveaway of all) {
      const delay = giveaway.end_timestamp - Date.now();

      if (delay <= 0) {
        if (startGiveaway?.endGiveaway) {
          startGiveaway.endGiveaway(
            client,
            giveaway.message_id
          );
        }
      } else {
        setTimeout(() => {
          if (startGiveaway?.endGiveaway) {
            startGiveaway.endGiveaway(
              client,
              giveaway.message_id
            );
          }
        }, delay);
      }
    }
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log(
        '[Giveaway] startgiveaway command not found - skipping restore'
      );
    } else {
      console.error('[Giveaway] Restore failed:', error);
    }
  }

  console.log('🚀 Bot fully operational');
});

// ===== MESSAGE CREATE =====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // TikTok conversion runs independently so downloads do not
  // block the existing command, AFK, and tracking systems.
  handleTikTokPreview(message).catch(error => {
    console.error('[TikTok] Unexpected error:', error);
  });

  // Existing handlers remain unchanged.
  await afkModule.handleMessage(client, message);
  await handleMessage(client, message);
  await messageTracker.handleMessage(client, message);

  try {
    if (client.automod?.checkMessage) {
      await client.automod.checkMessage(message);
    }
  } catch (error) {
    console.error('Automod error:', error);
  }

  try {
    const watchwordCommand = require('./commands/misc/watchword');

    if (watchwordCommand?.checkWatchwords) {
      await watchwordCommand.checkWatchwords(client, message);
    }
  } catch (error) {}
});

// ===== BUTTON INTERACTIONS =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (
    interaction.customId.startsWith('1v1_accept_') ||
    interaction.customId.startsWith('1v1_deny_')
  ) {
    try {
      const {
        handleButtonInteraction,
      } = require('./commands/misc/1v1');

      await handleButtonInteraction(interaction);
    } catch (error) {
      console.error('[1v1 Button]', error);

      if (!interaction.replied && !interaction.deferred) {
        interaction.reply({
          content: 'Something went wrong.',
          ephemeral: true,
        }).catch(() => {});
      }
    }
  }
});

// ===== MESSAGE DELETE / SNIPE =====
client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;

  const channelId = message.channel.id;

  if (!client.snipes.has(channelId)) {
    client.snipes.set(channelId, []);
  }

  let source = message;

  if (message.partial) {
    const fetched = await message.fetch().catch(() => null);

    if (fetched) source = fetched;
  }

  const media = [];

  for (const attachment of source.attachments?.values?.() || []) {
    media.push({
      type: 'attachment',
      url: attachment.url,
      proxyURL: attachment.proxyURL,
      contentType: attachment.contentType || null,
      name: attachment.name || null,
    });
  }

  for (const embed of source.embeds || []) {
    const imageUrl =
      embed.image?.url ||
      embed.thumbnail?.url ||
      embed.url;

    if (imageUrl) {
      media.push({
        type: 'embed',
        url: imageUrl,
        proxyURL: imageUrl,
        contentType: embed.type === 'gifv'
          ? 'image/gif'
          : null,
        name: embed.title ||
          embed.provider?.name ||
          'embedded media',
      });
    }
  }

  const stickers = [
    ...(source.stickers?.values?.() || []),
  ].map(sticker => ({
    name: sticker.name || 'sticker',
  }));

  const arr = client.snipes.get(channelId);

  arr.unshift({
    content: source.content || '',
    author: source.author || message.author,

    attachments: [
      ...(source.attachments?.values?.() || []),
    ].map(attachment => attachment.url),

    media,
    stickers,

    embeds: (source.embeds || []).map(embed => ({
      type: embed.type || null,
      url: embed.url || null,
      title: embed.title || null,

      image: embed.image
        ? { url: embed.image.url }
        : null,

      thumbnail: embed.thumbnail
        ? { url: embed.thumbnail.url }
        : null,

      provider: embed.provider
        ? { name: embed.provider.name || null }
        : null,
    })),

    createdAt:
      source.createdAt ||
      message.createdAt ||
      new Date(),
  });

  if (arr.length > 15) arr.pop();
});

// ===== MESSAGE UPDATE / EDIT SNIPE =====
client.on('messageUpdate', (oldMsg, newMsg) => {
  if (
    !oldMsg.guild ||
    oldMsg.author?.bot ||
    oldMsg.content === newMsg.content
  ) {
    return;
  }

  const channelId = oldMsg.channel.id;

  if (!client.edits.has(channelId)) {
    client.edits.set(channelId, []);
  }

  const arr = client.edits.get(channelId);

  arr.unshift({
    author: oldMsg.author,
    oldContent: oldMsg.content || '',
    newContent: newMsg.content || '',
    createdAt: newMsg.editedAt || new Date(),
  });

  if (arr.length > 15) arr.pop();
});

// ===== REACTION SNIPE =====
client.on('messageReactionAdd', (reaction, user) => {
  if (user.bot) return;

  const channelId = reaction.message.channel.id;

  if (!client.reactionSnipes.has(channelId)) {
    client.reactionSnipes.set(channelId, []);
  }

  const arr = client.reactionSnipes.get(channelId);

  arr.unshift({
    emoji: reaction.emoji.toString(),
    user,
    createdAt: new Date(),
  });

  if (arr.length > 15) arr.pop();
});

// ===== LOAD COMMANDS =====
loadCommands(client);

// ===== SHUTDOWN =====
function closeDatabases() {
  console.log('[Shutdown] Closing databases...');

  try {
    if (prefixlessDB) prefixlessDB.close();
    if (quarantineDB) quarantineDB.close();
    if (giveawayDB) giveawayDB.close();
    if (prefixDB) prefixDB.close();
    if (fameDB) fameDB.close();
    if (watchwordDB) watchwordDB.close();
    if (automodDB) automodDB.close();
    if (battleDB) battleDB.close();
    if (spyDB) spyDB.close();

    if (client.msgTrackerDB) {
      client.msgTrackerDB.close();
    }

    if (client.economyDB) {
      client.economyDB.close();
    }

    if (client.shopDB) {
      client.shopDB.close();
    }

    console.log('[Shutdown] Databases closed successfully');
  } catch (error) {
    console.error('[Shutdown] Error closing databases:', error);
  }

  process.exit(0);
}

process.on('SIGINT', closeDatabases);
process.on('SIGTERM', closeDatabases);

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);

module.exports = client;