require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const Database = require('better-sqlite3');

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ===== DATA FOLDER =====
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ===== DATABASES =====

// Prefixless DB
const prefixlessDB = new Database(path.join(DATA_DIR, 'prefixless.sqlite'));
prefixlessDB.prepare('CREATE TABLE IF NOT EXISTS prefixless (user_id TEXT PRIMARY KEY)').run();
client.prefixlessDB = prefixlessDB;
client.prefixless = new Set(prefixlessDB.prepare('SELECT user_id FROM prefixless').all().map(r => r.user_id));

// Quarantine DB
const quarantineDB = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
quarantineDB.prepare('CREATE TABLE IF NOT EXISTS quarantine (user_id TEXT PRIMARY KEY, roles TEXT)').run();
client.quarantineDB = quarantineDB;

// Giveaways DB
const giveawayDB = new Database(path.join(DATA_DIR, 'giveaways.sqlite'));
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

// Prefixes DB (per-server)
const prefixDB = new Database(path.join(DATA_DIR, 'prefixes.sqlite'));
prefixDB.prepare('CREATE TABLE IF NOT EXISTS prefixes (guild_id TEXT PRIMARY KEY, prefix TEXT)').run();
client.prefixDB = prefixDB;

// ===== AUTOMOD DATABASE =====
const automodDB = new Database(path.join(DATA_DIR, 'automod.sqlite'));

// Create automod tables
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

// ===== MODSTATS DATABASE =====
automodDB.prepare(`
  CREATE TABLE IF NOT EXISTS modstats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    reason TEXT,
    duration TEXT,
    timestamp INTEGER NOT NULL
  )
`).run();

// ===== CRITICAL: ATTACH DATABASES TO CLIENT =====
client.automodDB = automodDB;
client.modstatsDB = automodDB; // THIS WAS MISSING!

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
  try {
    const row = client.prefixDB.prepare('SELECT prefix FROM prefixes WHERE guild_id = ?').get(guildId);
    return row?.prefix || '$';
  } catch (err) {
    console.error('getPrefix error:', err);
    return '$';
  }
};

// ===== READY EVENT =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Load blacklist cache
  console.log('[Blacklist] Loading cache from database...');
  const guilds = client.automodDB.prepare(`SELECT DISTINCT guild_id FROM blacklist_hard UNION SELECT DISTINCT guild_id FROM blacklist_soft`).all();

  for (const { guild_id } of guilds) {
    const hardWords = client.automodDB.prepare(`SELECT word FROM blacklist_hard WHERE guild_id = ?`).all(guild_id).map(r => r.word);
    const softWords = client.automodDB.prepare(`SELECT word FROM blacklist_soft WHERE guild_id = ?`).all(guild_id).map(r => r.word);

    client.blacklistCache.set(guild_id, {
      hard: hardWords,
      soft: softWords
    });
  }
  console.log(`[Blacklist] Cache loaded for ${guilds.length} guilds`);

  // Initialize automod
  const automodModule = require('./handlers/automodHandler');
  if (automodModule && typeof automodModule.initAutomod === 'function') {
    try {
      automodModule.initAutomod(client);
      console.log('✅ Automod system initialized');
    } catch (e) {
      console.error('❌ Failed to init automod:', e.message);
    }
  }

  // Load giveaways
  const all = client.giveawayDB.prepare('SELECT * FROM giveaways').all();
  for (const g of all) {
    const delay = g.end_timestamp - Date.now();
    if (delay <= 0) {
      require('./commands/startgiveaway').endGiveaway(client, g.message_id);
    } else {
      setTimeout(() => require('./commands/startgiveaway').endGiveaway(client, g.message_id), delay);
    }
  }

  console.log('✅ Bot is ready!');
});

// ===== MESSAGE EVENT =====
client.on('messageCreate', async (message) => {
  // Skip bots
  if (message.author.bot) return;

  // Handle commands
  await handleMessage(client, message);

  // Run automod check
  try {
    if (client.automod && client.automod.checkMessage) {
      await client.automod.checkMessage(message);
    }
  } catch (e) {
    console.error('Automod check error:', e.message);
  }
});

// ===== MESSAGE DELETE (for snipes) =====
client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;

  const channelId = message.channel.id;
  if (!client.snipes.has(channelId)) client.snipes.set(channelId, []);

  const arr = client.snipes.get(channelId);
  arr.unshift({
    content: message.content || '',
    author: message.author,
    attachments: [...message.attachments.values()].map(a => a.url),
    createdAt: message.createdAt,
  });
  if (arr.length > 15) arr.pop();
});

// ===== MESSAGE UPDATE (for edits) =====
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!oldMsg.guild || oldMsg.author?.bot || oldMsg.content === newMsg.content) return;

  const channelId = oldMsg.channel.id;
  if (!client.edits.has(channelId)) client.edits.set(channelId, []);

  const arr = client.edits.get(channelId);
  arr.unshift({
    author: oldMsg.author,
    oldContent: oldMsg.content || '',
    newContent: newMsg.content || '',
    createdAt: newMsg.editedAt || new Date(),
  });
  if (arr.length > 15) arr.pop();
});

// ===== REACTION EVENTS =====
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  const channelId = reaction.message.channel.id;
  if (!client.reactionSnipes.has(channelId)) client.reactionSnipes.set(channelId, []);

  const arr = client.reactionSnipes.get(channelId);
  arr.unshift({ emoji: reaction.emoji.toString(), user, createdAt: new Date() });
  if (arr.length > 15) arr.pop();
});

// ===== LOAD COMMANDS =====
loadCommands(client);

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);

module.exports = client;