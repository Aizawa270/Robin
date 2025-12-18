require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const Database = require('better-sqlite3');

/* ============================
   DATA DIRECTORY (REQUIRED)
============================ */
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* ============================
   CLIENT
============================ */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

/* ============================
   PREFIXLESS DATABASE (FIXED)
============================ */
const PREFIXLESS_DB_PATH = path.join(DATA_DIR, 'prefixless.sqlite');
const prefixlessDB = new Database(PREFIXLESS_DB_PATH);

// Ensure table exists
prefixlessDB.prepare(`
  CREATE TABLE IF NOT EXISTS prefixless (
    user_id TEXT PRIMARY KEY
  )
`).run();

// Attach DB + MEMORY CACHE
client.prefixlessDB = prefixlessDB;
client.prefixless = new Set();

// 🔥 THIS IS THE PART YOU WERE MISSING EARLIER
const prefixlessRows = prefixlessDB
  .prepare('SELECT user_id FROM prefixless')
  .all();

for (const row of prefixlessRows) {
  client.prefixless.add(row.user_id);
}

console.log(`[PREFIXLESS] Loaded ${client.prefixless.size} users from DB`);

/* ============================
   QUARANTINE DATABASE
============================ */
const QUARANTINE_DB_PATH = path.join(DATA_DIR, 'quarantine.sqlite');
const quarantineDB = new Database(QUARANTINE_DB_PATH);

quarantineDB.prepare(`
  CREATE TABLE IF NOT EXISTS quarantine (
    user_id TEXT PRIMARY KEY,
    roles TEXT
  )
`).run();

client.quarantineDB = quarantineDB;

/* ============================
   AFK / SNIPE STORAGE
============================ */
client.afk = new Map();

client.snipes = new Map();
client.snipesEdit = new Map();
client.snipesImage = new Map();

/* ============================
   READY
============================ */
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ============================
   MESSAGE HANDLER
============================ */
client.on('messageCreate', (message) => {
  handleMessage(client, message);
});

/* ============================
   LOAD COMMANDS & LOGIN
============================ */
loadCommands(client);

client.login(process.env.DISCORD_TOKEN);