require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const Database = require('better-sqlite3');

// ===== DATA FOLDER =====
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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

// ===== MEMORY MAPS =====
client.afk = new Map();
client.snipes = new Map();
client.snipesImage = new Map();
client.edits = new Map();
client.reactionSnipes = new Map();
client.giveaways = new Map();

// ===== IMPORT AUTOMOD EARLY =====
let automodModule;
try {
  automodModule = require('./handlers/automodHandler');
  console.log('✅ Automod module loaded');
} catch (e) {
  console.warn('⚠️ Could not load automod module:', e.message);
}

// ===== MESSAGE DELETE =====
client.on('messageDelete', async (message) => {
  if (!message.guild) return;
  if (message.partial) {
    try { message = await message.fetch(); } catch { return; }
  }
  if (!message.content && message.attachments.size === 0) return;
  if (message.author?.bot) return;

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

  if (message.attachments.size > 0) {
    if (!client.snipesImage.has(channelId)) client.snipesImage.set(channelId, []);
    const imgArr = client.snipesImage.get(channelId);
    imgArr.unshift({
      content: message.content || '',
      author: message.author,
      attachments: [...message.attachments.values()].map(a => a.url),
      createdAt: message.createdAt,
    });
    if (imgArr.length > 15) imgArr.pop();
  }
});

// ===== MESSAGE UPDATE =====
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!oldMsg.guild) return;
  if (oldMsg.partial) {
    try { oldMsg = await oldMsg.fetch(); } catch { return; }
  }
  if (oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;

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

// ===== REACTIONS =====
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch {}
  }

  const channelId = reaction.message.channel.id;
  if (!client.reactionSnipes.has(channelId)) client.reactionSnipes.set(channelId, []);
  const arr = client.reactionSnipes.get(channelId);
  arr.unshift({ emoji: reaction.emoji.toString(), user, createdAt: new Date() });
  if (arr.length > 15) arr.pop();
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch {}
  }
});

// ===== DYNAMIC PREFIX =====
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

// ===== READY =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Initialize automod IMMEDIATELY when bot is ready
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
});

// ===== MESSAGE CREATE (COMMAND HANDLER + AUTOMOD) =====
if (!client.messageCreateHandlerAttached) {
  client.on('messageCreate', async (message) => {
    // Handle commands first
    await handleMessage(client, message);

    // Then run automod check on EVERY message
    try {
      // If automod isn't initialized yet, try to initialize it NOW
      if (!client.automod || !client.automod.checkMessage) {
        if (automodModule && typeof automodModule.initAutomod === 'function') {
          automodModule.initAutomod(client);
          console.log('[Automod] Initialized via message event');
        }
      }
      
      // Now run the automod check
      if (client.automod && client.automod.checkMessage) {
        await client.automod.checkMessage(client, message);
      }
    } catch (e) {
      console.error('Automod check error:', e.message);
    }
  });
  client.messageCreateHandlerAttached = true;
}

// ===== LOAD COMMANDS =====
loadCommands(client);

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);

module.exports = client;