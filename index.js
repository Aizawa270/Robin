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
   PREFIXLESS DATABASE
============================ */
const PREFIXLESS_DB_PATH = path.join(DATA_DIR, 'prefixless.sqlite');
const prefixlessDB = new Database(PREFIXLESS_DB_PATH);

prefixlessDB.prepare(`
  CREATE TABLE IF NOT EXISTS prefixless (
    user_id TEXT PRIMARY KEY
  )
`).run();

client.prefixlessDB = prefixlessDB;
client.prefixless = new Set();

// Load existing users
const prefixlessRows = prefixlessDB.prepare('SELECT user_id FROM prefixless').all();
for (const row of prefixlessRows) client.prefixless.add(row.user_id);
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
client.snipes = new Map();       // Deleted text messages
client.snipesEdit = new Map();   // Edited messages
client.snipesImage = new Map();  // Deleted images/GIFs

/* ============================
   SNIPE LISTENERS
============================ */

// Deleted messages
client.on('messageDelete', (message) => {
  if (message.author?.bot) return;

  const channelId = message.channel.id;

  // Text messages
  if (!client.snipes.has(channelId)) client.snipes.set(channelId, []);
  const textArr = client.snipes.get(channelId);
  textArr.unshift({
    content: message.content,
    author: message.author,
    createdAt: message.createdAt,
    attachments: message.attachments.map(a => a.url),
  });
  if (textArr.length > 15) textArr.pop();
  client.snipes.set(channelId, textArr);

  // Images/GIFs
  if (message.attachments.size > 0) {
    if (!client.snipesImage.has(channelId)) client.snipesImage.set(channelId, []);
    const imgArr = client.snipesImage.get(channelId);
    imgArr.unshift({
      content: message.content,
      author: message.author,
      createdAt: message.createdAt,
      attachments: message.attachments.map(a => a.url),
    });
    if (imgArr.length > 15) imgArr.pop();
    client.snipesImage.set(channelId, imgArr);
  }
});

// Edited messages
client.on('messageUpdate', (oldMessage, newMessage) => {
  if (oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const channelId = oldMessage.channel.id;

  if (!client.snipesEdit.has(channelId)) client.snipesEdit.set(channelId, []);
  const arr = client.snipesEdit.get(channelId);
  arr.unshift({
    oldContent: oldMessage.content,
    newContent: newMessage.content,
    author: oldMessage.author,
    createdAt: newMessage.editedAt || new Date(),
  });
  if (arr.length > 15) arr.pop();
  client.snipesEdit.set(channelId, arr);
});

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