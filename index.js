require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const { prefix } = require('./config');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ===== PREFIXLESS DB =====
const PREFIXLESS_DB = path.join(DATA_DIR, 'prefixless.sqlite');
const prefixlessDB = new Database(PREFIXLESS_DB);
prefixlessDB.prepare(`
  CREATE TABLE IF NOT EXISTS prefixless (
    user_id TEXT PRIMARY KEY
  )
`).run();
client.prefixlessDB = prefixlessDB;

// Load prefixless into memory
client.prefixless = new Set();
const rows = prefixlessDB.prepare('SELECT user_id FROM prefixless').all();
for (const row of rows) client.prefixless.add(row.user_id);

// ===== QUARANTINE DB =====
const QUARANTINE_DB = path.join(DATA_DIR, 'quarantine.sqlite');
const quarantineDB = new Database(QUARANTINE_DB);
quarantineDB.prepare(`
  CREATE TABLE IF NOT EXISTS quarantine (
    user_id TEXT PRIMARY KEY,
    roles TEXT
  )
`).run();
client.quarantineDB = quarantineDB;

// ===== AFK =====
client.afk = new Map();

// ===== SNIPE STORAGE =====
client.snipes = new Map();
client.snipesEdit = new Map();
client.snipesImage = new Map();

// ===== READY =====
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== MESSAGE HANDLER =====
client.on('messageCreate', (message) => handleMessage(client, message));

// ===== LOAD COMMANDS & LOGIN =====
loadCommands(client);
client.login(process.env.DISCORD_TOKEN);