// index.js — REPLACE your current file with this
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
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

// ===== AUTOMOD HANDLER (require once) =====
const automod = require('./handlers/automodHandler'); // expect exports: initAutomod, handleInteractions, checkMessage (if used elsewhere)

// ===== LOAD COMMANDS FIRST =====
loadCommands(client);

// ===== AUTOMOD INIT & INTERACTIONS (before message handling) =====
if (typeof automod.initAutomod === 'function') {
  automod.initAutomod(client);
}
if (typeof automod.handleInteractions === 'function') {
  automod.handleInteractions(client);
}

// ===== READY =====
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Resume giveaways
  try {
    const all = client.giveawayDB.prepare('SELECT * FROM giveaways').all();
    for (const g of all) {
      const delay = g.end_timestamp - Date.now();
      if (delay <= 0) {
        require('./commands/startgiveaway').endGiveaway(client, g.message_id);
      } else {
        setTimeout(() => require('./commands/startgiveaway').endGiveaway(client, g.message_id), delay);
      }
    }
  } catch (err) {
    console.error('Error resuming giveaways:', err);
  }
});

// ===== MESSAGE CREATE (COMMAND HANDLER only) =====
// Important: handleMessage already calls automod.checkMessage (your handler) — do NOT call automod twice.
// We attach the listener after commands + automod init above.
if (!client.messageCreateHandlerAttached) {
  client.on('messageCreate', (message) => handleMessage(client, message));
  client.messageCreateHandlerAttached = true;
}

// ===== OTHER LISTENERS (snipes, edits, reactions) =====
// Keep your existing listeners as-is — if you have them in other files ensure no duplicates.
// (You said earlier these exist already in this file; if you moved them elsewhere, fine.)

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});

module.exports = client;