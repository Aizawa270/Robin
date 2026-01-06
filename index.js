// index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const Database = require('better-sqlite3');

// 🔥 SERVICES
const birthdayService = require('./handlers/birthdayService');

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
prefixlessDB.pragma('journal_mode = WAL');
prefixlessDB.prepare(
  'CREATE TABLE IF NOT EXISTS prefixless (user_id TEXT PRIMARY KEY)'
).run();

client.prefixlessDB = prefixlessDB;
client.prefixless = new Set(
  prefixlessDB.prepare('SELECT user_id FROM prefixless').all().map(r => r.user_id)
);

// Quarantine DB
const quarantineDB = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
quarantineDB.pragma('journal_mode = WAL');
quarantineDB.prepare(
  'CREATE TABLE IF NOT EXISTS quarantine (user_id TEXT PRIMARY KEY, roles TEXT)'
).run();
client.quarantineDB = quarantineDB;

// Giveaways DB
const giveawayDB = new Database(path.join(DATA_DIR, 'giveaways.sqlite'));
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

// Prefix DB
const prefixDB = new Database(path.join(DATA_DIR, 'prefixes.sqlite'));
prefixDB.pragma('journal_mode = WAL');
prefixDB.prepare(
  'CREATE TABLE IF NOT EXISTS prefixes (guild_id TEXT PRIMARY KEY, prefix TEXT)'
).run();
client.prefixDB = prefixDB;

// ===== AUTOMOD + MODSTATS =====
const automodDB = new Database(path.join(DATA_DIR, 'automod.sqlite'));
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

client.automodDB = automodDB;
client.modstatsDB = automodDB;

// ===== BATTLES DB =====
const battleDB = new Database(path.join(DATA_DIR, 'battles.sqlite'));
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

// ===== READY EVENT =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // 🔥 INIT BIRTHDAY SYSTEM
  birthdayService(client);

  // 🔁 Hydrate blacklist cache
  try {
    const guilds = automodDB
      .prepare(`
        SELECT DISTINCT guild_id FROM blacklist_hard
        UNION
        SELECT DISTINCT guild_id FROM blacklist_soft
      `)
      .all();

    for (const { guild_id } of guilds) {
      const hard = automodDB
        .prepare('SELECT word FROM blacklist_hard WHERE guild_id = ?')
        .all(guild_id)
        .map(r => r.word);

      const soft = automodDB
        .prepare('SELECT word FROM blacklist_soft WHERE guild_id = ?')
        .all(guild_id)
        .map(r => r.word);

      client.blacklistCache.set(guild_id, { hard, soft });
    }

    console.log(`[Blacklist] Loaded for ${client.blacklistCache.size} guilds`);
  } catch (e) {
    console.error('[Blacklist] Cache failed:', e);
  }

  // 🔒 Automod init
  try {
    const automod = require('./handlers/automodHandler');
    if (automod?.initAutomod) automod.initAutomod(client);
  } catch (e) {
    console.error('Automod init failed:', e);
  }

  // 🎁 Restore giveaways
  try {
    const all = giveawayDB.prepare('SELECT * FROM giveaways').all();
    for (const g of all) {
      const delay = g.end_timestamp - Date.now();
      if (delay <= 0) {
        require('./commands/startgiveaway').endGiveaway(client, g.message_id);
      } else {
        setTimeout(
          () => require('./commands/startgiveaway').endGiveaway(client, g.message_id),
          delay
        );
      }
    }
  } catch (e) {
    console.error('Giveaway restore failed:', e);
  }

  console.log('🚀 Bot fully operational');
});

// ===== MESSAGE EVENT =====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  await handleMessage(client, message);

  try {
    if (client.automod?.checkMessage) {
      await client.automod.checkMessage(message);
    }
  } catch (e) {
    console.error('Automod error:', e);
  }
});

// ===== SNIPES =====
client.on('messageDelete', (message) => {
  if (!message.guild || message.author?.bot) return;

  const id = message.channel.id;
  if (!client.snipes.has(id)) client.snipes.set(id, []);

  const arr = client.snipes.get(id);
  arr.unshift({
    content: message.content || '',
    author: message.author,
    attachments: [...message.attachments.values()].map(a => a.url),
    createdAt: message.createdAt,
  });

  if (arr.length > 15) arr.pop();
});

// ===== EDIT SNIPES =====
client.on('messageUpdate', (oldMsg, newMsg) => {
  if (!oldMsg.guild || oldMsg.author?.bot || oldMsg.content === newMsg.content) return;

  const id = oldMsg.channel.id;
  if (!client.edits.has(id)) client.edits.set(id, []);

  const arr = client.edits.get(id);
  arr.unshift({
    author: oldMsg.author,
    oldContent: oldMsg.content || '',
    newContent: newMsg.content || '',
    createdAt: newMsg.editedAt || new Date(),
  });

  if (arr.length > 15) arr.pop();
});

// ===== REACTION SNIPES =====
client.on('messageReactionAdd', (reaction, user) => {
  if (user.bot) return;

  const id = reaction.message.channel.id;
  if (!client.reactionSnipes.has(id)) client.reactionSnipes.set(id, []);

  const arr = client.reactionSnipes.get(id);
  arr.unshift({ emoji: reaction.emoji.toString(), user, createdAt: new Date() });

  if (arr.length > 15) arr.pop();
});

// ===== LOAD COMMANDS =====
loadCommands(client);

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);

module.exports = client;