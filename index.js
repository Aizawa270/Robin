require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const Database = require('better-sqlite3');

/* ============================
   DATA DIR
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
  partials: [Partials.Message, Partials.Channel],
});

/* ============================
   PREFIXLESS DB
============================ */
const prefixlessDB = new Database(path.join(DATA_DIR, 'prefixless.sqlite'));
prefixlessDB.prepare(`
  CREATE TABLE IF NOT EXISTS prefixless (user_id TEXT PRIMARY KEY)
`).run();

client.prefixlessDB = prefixlessDB;
client.prefixless = new Set(
  prefixlessDB.prepare('SELECT user_id FROM prefixless').all().map(r => r.user_id)
);

/* ============================
   QUARANTINE DB
============================ */
const quarantineDB = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
quarantineDB.prepare(`
  CREATE TABLE IF NOT EXISTS quarantine (
    user_id TEXT PRIMARY KEY,
    roles TEXT
  )
`).run();
client.quarantineDB = quarantineDB;

/* ============================
   MEMORY STORES
============================ */
client.afk = new Map();
client.snipes = new Map();
client.snipesImage = new Map();
client.edits = new Map();

/* ============================
   MESSAGE DELETE (SNIPE)
============================ */
client.on('messageDelete', async (message) => {
  if (!message.guild) return;
  if (message.partial) {
    try { message = await message.fetch(); } catch { return; }
  }
  if (message.author?.bot) return;

  const channelId = message.channel.id;

  // TEXT
  if (!client.snipes.has(channelId)) client.snipes.set(channelId, []);
  client.snipes.get(channelId).unshift({
    content: message.content,
    author: message.author,
    attachments: message.attachments,
    createdAt: message.createdAt,
  });
  if (client.snipes.get(channelId).length > 15)
    client.snipes.get(channelId).pop();

  // IMAGES
  if (message.attachments.size) {
    if (!client.snipesImage.has(channelId)) client.snipesImage.set(channelId, []);
    client.snipesImage.get(channelId).unshift({
      content: message.content,
      author: message.author,
      attachments: [...message.attachments.values()].map(a => a.url),
      createdAt: message.createdAt,
    });
    if (client.snipesImage.get(channelId).length > 15)
      client.snipesImage.get(channelId).pop();
  }
});

/* ============================
   MESSAGE UPDATE (SNIPEDIT)
============================ */
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!oldMsg.guild) return;
  if (oldMsg.partial) {
    try { oldMsg = await oldMsg.fetch(); } catch { return; }
  }
  if (oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;

  const channelId = oldMsg.channel.id;
  if (!client.edits.has(channelId)) client.edits.set(channelId, []);

  client.edits.get(channelId).unshift({
    author: oldMsg.author,
    oldContent: oldMsg.content,
    newContent: newMsg.content,
    createdAt: new Date(),
  });

  if (client.edits.get(channelId).length > 15)
    client.edits.get(channelId).pop();
});

/* ============================
   READY
============================ */
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ============================
   COMMAND HANDLER
============================ */
client.on('messageCreate', (message) => {
  handleMessage(client, message);
});

loadCommands(client);
client.login(process.env.DISCORD_TOKEN);