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
    GatewayIntentBits.GuildMessageReactions, // ✅ REQUIRED FOR SR
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction, // ✅ REQUIRED FOR SR
  ],
});

// ===== DATABASES =====
const prefixlessDB = new Database(path.join(DATA_DIR, 'prefixless.sqlite'));
prefixlessDB
  .prepare('CREATE TABLE IF NOT EXISTS prefixless (user_id TEXT PRIMARY KEY)')
  .run();
client.prefixlessDB = prefixlessDB;
client.prefixless = new Set(
  prefixlessDB.prepare('SELECT user_id FROM prefixless').all().map(r => r.user_id)
);

const quarantineDB = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
quarantineDB
  .prepare('CREATE TABLE IF NOT EXISTS quarantine (user_id TEXT PRIMARY KEY, roles TEXT)')
  .run();
client.quarantineDB = quarantineDB;

// ===== MEMORY MAPS =====
client.afk = new Map();
client.snipes = new Map();            // deleted text
client.snipesImage = new Map();       // deleted images
client.edits = new Map();             // edited messages
client.reactionSnipes = new Map();    // ✅ reaction snipes

// ===== MESSAGE DELETE =====
client.on('messageDelete', async (message) => {
  if (!message.guild) return;

  if (message.partial) {
    try { message = await message.fetch(); }
    catch { return; }
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
});

// ===== MESSAGE UPDATE =====
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!oldMsg.guild) return;

  if (oldMsg.partial) {
    try { oldMsg = await oldMsg.fetch(); }
    catch { return; }
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

// ===== REACTION ADD (SNIPEREACTION CORE) =====
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try { await reaction.fetch(); }
    catch { return; }
  }

  const channelId = reaction.message.channel.id;

  if (!client.reactionSnipes.has(channelId)) {
    client.reactionSnipes.set(channelId, []);
  }

  const arr = client.reactionSnipes.get(channelId);

  arr.unshift({
    emoji: reaction.emoji.toString(),
    user,
    createdAt: new Date(),
  });

  if (arr.length > 15) arr.pop();
});

// ===== READY =====
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== COMMAND HANDLER =====
if (!client.messageCreateHandlerAttached) {
  client.on('messageCreate', (message) => handleMessage(client, message));
  client.messageCreateHandlerAttached = true;
}

// ===== LOAD COMMANDS =====
loadCommands(client);

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);