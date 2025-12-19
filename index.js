require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
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
  partials: [Partials.Message, Partials.Channel],
});

// DBs
const prefixlessDB = new Database(path.join(DATA_DIR, 'prefixless.sqlite'));
prefixlessDB.prepare('CREATE TABLE IF NOT EXISTS prefixless (user_id TEXT PRIMARY KEY)').run();
client.prefixlessDB = prefixlessDB;
client.prefixless = new Set(prefixlessDB.prepare('SELECT user_id FROM prefixless').all().map(r => r.user_id));

const quarantineDB = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
quarantineDB.prepare('CREATE TABLE IF NOT EXISTS quarantine (user_id TEXT PRIMARY KEY, roles TEXT)').run();
client.quarantineDB = quarantineDB;

// MEMORY MAPS
client.afk = new Map();
client.snipes = new Map();       // deleted text
client.snipesImage = new Map();  // deleted images/gifs
client.edits = new Map();        // edited messages

// ===== MESSAGE DELETE =====
client.on('messageDelete', async (message) => {
  if (!message.guild) return;
  if (message.partial) {
    try { message = await message.fetch(); } catch { return; }
  }
  if (!message.content && message.attachments.size === 0) return;
  if (message.author?.bot) return;

  const channelId = message.channel.id;

  // Text messages
  if (!client.snipes.has(channelId)) client.snipes.set(channelId, []);
  const textArr = client.snipes.get(channelId);
  textArr.unshift({
    content: message.content || '',
    author: message.author,
    attachments: [...message.attachments.values()].map(a => a.url), // always array
    createdAt: message.createdAt
  });
  if (textArr.length > 15) textArr.pop();
  client.snipes.set(channelId, textArr);

  // Images/GIFs
  if (message.attachments.size > 0) {
    if (!client.snipesImage.has(channelId)) client.snipesImage.set(channelId, []);
    const imgArr = client.snipesImage.get(channelId);
    imgArr.unshift({
      content: message.content || '',
      author: message.author,
      attachments: [...message.attachments.values()].map(a => a.url), // always array
      createdAt: message.createdAt
    });
    if (imgArr.length > 15) imgArr.pop();
    client.snipesImage.set(channelId, imgArr);
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
    createdAt: newMsg.editedAt || new Date()
  });
  if (arr.length > 15) arr.pop();
  client.edits.set(channelId, arr);
});

// READY & HANDLER
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.on('messageCreate', (message) => handleMessage(client, message));

loadCommands(client);
client.login(process.env.DISCORD_TOKEN);