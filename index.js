require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const { defaultPrefixless } = require('./config');

/* ============================
   FILE PATHS (PERSISTENT)
============================ */
const DATA_DIR = path.join(__dirname, 'data');
const PREFIXLESS_FILE = path.join(DATA_DIR, 'prefixless.json');

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
   ENSURE DATA DIRECTORY
============================ */
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(PREFIXLESS_FILE)) {
  fs.writeFileSync(PREFIXLESS_FILE, JSON.stringify([], null, 2));
}

/* ============================
   AFK STORAGE
============================ */
client.afk = new Map();

/* ============================
   PREFIXLESS (PERSISTENT)
============================ */
try {
  const data = fs.readFileSync(PREFIXLESS_FILE, 'utf8');
  const ids = JSON.parse(data);
  client.prefixless = new Set(ids);
} catch (err) {
  console.error('Failed to load prefixless.json, resetting:', err);
  client.prefixless = new Set(defaultPrefixless || []);
  fs.writeFileSync(PREFIXLESS_FILE, JSON.stringify([...client.prefixless], null, 2));
}

client.savePrefixless = () => {
  try {
    fs.writeFileSync(
      PREFIXLESS_FILE,
      JSON.stringify([...client.prefixless], null, 2)
    );
  } catch (err) {
    console.error('Failed to save prefixless:', err);
  }
};

/* ============================
   SNIPE STORAGE
============================ */
client.snipes = new Map();
client.snipesEdit = new Map();
client.snipesImage = new Map();
client.edits = client.snipesEdit; // compatibility for snipedit

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

  if (!client.snipes.has(message.channel.id)) {
    client.snipes.set(message.channel.id, []);
  }

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

  if (!client.snipesEdit.has(oldMessage.channel.id)) {
    client.snipesEdit.set(oldMessage.channel.id, []);
  }

  const arr = client.snipesEdit.get(oldMessage.channel.id);
  arr.unshift(data);
  if (arr.length > 15) arr.pop();
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