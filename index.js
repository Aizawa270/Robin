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

// Snipes storage
client.snipes = new Map();      // deleted messages
client.editSnipes = new Map();  // edited messages

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

// --- Event: Bot ready ---
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// --- Event: Message delete ---
client.on('messageDelete', (message) => {
  if (!message.guild) return;

  const attachments = message.attachments.map(a => a.url); // store all attachments

  const entry = {
    content: message.content,
    author: message.author,
    attachments,
    createdAt: Date.now(),
  };

  if (!client.snipes.has(message.channel.id)) client.snipes.set(message.channel.id, []);
  const arr = client.snipes.get(message.channel.id);
  arr.unshift(entry);
  if (arr.length > 15) arr.pop(); // keep last 15 deleted messages
  client.snipes.set(message.channel.id, arr);
});

// --- Event: Message update ---
client.on('messageUpdate', (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.content === newMessage.content) return;

  if (!client.editSnipes.has(oldMessage.channel.id)) client.editSnipes.set(oldMessage.channel.id, []);
  const arr = client.editSnipes.get(oldMessage.channel.id);

  arr.unshift({
    oldContent: oldMessage.content,
    newContent: newMessage.content,
    author: oldMessage.author,
    createdAt: Date.now(),
  });

  if (arr.length > 15) arr.pop();
  client.editSnipes.set(oldMessage.channel.id, arr);
});

// --- Event: Message create ---
client.on('messageCreate', (message) => {
  handleMessage(client, message);
});

// --- Load commands ---
loadCommands(client);

// --- Login bot ---
client.login(process.env.DISCORD_TOKEN);