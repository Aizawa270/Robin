require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const { defaultPrefixless } = require('./config');

const PREFIXLESS_FILE = './prefixless.json';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// AFK storage
client.afk = new Map(); // userId -> { reason, since }

// --- Load persistent prefixless ---
try {
  const data = fs.readFileSync(PREFIXLESS_FILE, 'utf8');
  const ids = JSON.parse(data);
  client.prefixless = new Set(ids);
} catch {
  client.prefixless = new Set(defaultPrefixless || []);
}

// Helper: save prefixless whenever it changes
client.savePrefixless = () => {
  fs.writeFileSync(PREFIXLESS_FILE, JSON.stringify([...client.prefixless]));
};

// --- Snipe storage ---
client.snipes = new Map();       // text messages
client.snipesEdit = new Map();   // edited messages
client.snipesImage = new Map();  // images/GIFs

// --- Capture deleted messages for snipe ---
client.on('messageDelete', (message) => {
  if (!message.guild) return;

  // Text snipe
  const textData = {
    author: message.author,
    content: message.content || '',
    attachments: Array.from(message.attachments.values()).map(a => a.proxyURL),
  };

  // Text snipes
  if (!client.snipes.has(message.channel.id)) client.snipes.set(message.channel.id, []);
  const arr = client.snipes.get(message.channel.id);
  arr.unshift(textData);
  if (arr.length > 15) arr.pop();
  client.snipes.set(message.channel.id, arr);

  // Image snipes
  if (message.attachments.size) {
    if (!client.snipesImage.has(message.channel.id)) client.snipesImage.set(message.channel.id, []);
    const imgArr = client.snipesImage.get(message.channel.id);
    imgArr.unshift(textData);
    if (imgArr.length > 15) imgArr.pop();
    client.snipesImage.set(message.channel.id, imgArr);
  }
});

// --- Capture edited messages for snipe edit ---
client.on('messageUpdate', (oldMessage, newMessage) => {
  if (!oldMessage.guild) return;
  if (oldMessage.content === newMessage.content) return;

  const editData = {
    author: oldMessage.author,
    oldContent: oldMessage.content || '',
    newContent: newMessage.content || '',
  };

  if (!client.snipesEdit.has(oldMessage.channel.id)) client.snipesEdit.set(oldMessage.channel.id, []);
  const arr = client.snipesEdit.get(oldMessage.channel.id);
  arr.unshift(editData);
  if (arr.length > 15) arr.pop();
  client.snipesEdit.set(oldMessage.channel.id, arr);
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// --- Handle messages ---
client.on('messageCreate', (message) => handleMessage(client, message));

// Load commands
loadCommands(client);

// Login
client.login(process.env.DISCORD_TOKEN);