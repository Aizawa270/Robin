require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const { defaultPrefixless } = require('./config');
const Database = require('better-sqlite3');

/* ============================
   FILE PATHS (PERSISTENT)
============================ */
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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
   DATABASES
============================ */
// Prefixless SQLite
const PREFIXLESS_DB = path.join(DATA_DIR, 'prefixless.sqlite');
const prefixlessDB = new Database(PREFIXLESS_DB);

// create table if not exists
prefixlessDB.prepare(`
  CREATE TABLE IF NOT EXISTS prefixless (
    user_id TEXT PRIMARY KEY
  )
`).run();

client.prefixlessDB = prefixlessDB;

// Quarantine SQLite
const QUARANTINE_DB = path.join(DATA_DIR, 'quarantine.sqlite');
const quarantineDB = new Database(QUARANTINE_DB);

// create table if not exists
quarantineDB.prepare(`
  CREATE TABLE IF NOT EXISTS quarantine (
    user_id TEXT PRIMARY KEY,
    roles TEXT
  )
`).run();

client.quarantineDB = quarantineDB;

/* ============================
   AFK STORAGE
============================ */
client.afk = new Map();

/* ============================
   SNIPE STORAGE
============================ */
client.snipes = new Map();
client.snipesEdit = new Map();
client.snipesImage = new Map();
client.edits = client.snipesEdit;

/* ============================
   MESSAGE DELETE (SNIPE)
============================ */
client.on('messageDelete', (message) => {
  if (!message.guild || !message.author) return;

  const data = {
    author: message.author,
    content: message.content || '',
    attachments: [...message.attachments.values()].map(a => a.proxyURL),
  };

  if (!client.snipes.has(message.channel.id)) client.snipes.set(message.channel.id, []);
  const arr = client.snipes.get(message.channel.id);
  arr.unshift(data);
  if (arr.length > 15) arr.pop();
});

/* ============================
   MESSAGE UPDATE (SNIPEDIT)
============================ */
client.on('messageUpdate', (oldMessage, newMessage) => {
  if (!oldMessage.guild) return;
  if (oldMessage.content === newMessage.content) return;

  const data = {
    author: oldMessage.author,
    oldContent: oldMessage.content || '',
    newContent: newMessage.content || '',
    createdAt: newMessage.createdAt,
  };

  if (!client.snipesEdit.has(oldMessage.channel.id)) client.snipesEdit.set(oldMessage.channel.id, []);
  const arr = client.snipesEdit.get(oldMessage.channel.id);
  arr.unshift(data);
  if (arr.length > 15) arr.pop();
});

/* ============================
   READY
============================ */
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const QUARANTINE_ROLE_ID = '1432363678430396436';

  // Restore quarantine roles after restart
  const rows = client.quarantineDB.prepare('SELECT user_id FROM quarantine').all();
  for (const row of rows) {
    for (const guild of client.guilds.cache.values()) {
      const member = await guild.members.fetch(row.user_id).catch(() => null);
      if (!member) continue;
      if (!member.roles.cache.has(QUARANTINE_ROLE_ID)) {
        await member.roles.set([QUARANTINE_ROLE_ID]).catch(console.error);
      }
    }
  }
});

/* ============================
   MESSAGE HANDLER
============================ */
client.on('messageCreate', (message) => handleMessage(client, message));

/* ============================
   LOAD COMMANDS & LOGIN
============================ */
loadCommands(client);
client.login(process.env.DISCORD_TOKEN);