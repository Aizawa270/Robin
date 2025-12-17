require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const { defaultPrefixless } = require('./config');

const PREFIXLESS_FILE = './prefixless.json';
const MAX_SNIPES = 15;

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

// --- Sniping system ---
client.snipes = new Map();       // Deleted text messages
client.edits = new Map();        // Edited messages
client.imageSnipes = new Map();  // Deleted images/GIFs

function pushSnipe(map, channelId, data) {
  if (!map.has(channelId)) map.set(channelId, []);
  const arr = map.get(channelId);
  arr.unshift(data);            // newest first
  if (arr.length > MAX_SNIPES) arr.pop();
  map.set(channelId, arr);
}

// Message delete listener
client.on('messageDelete', (message) => {
  if (message.author.bot) return;

  if (message.attachments.size > 0) {
    pushSnipe(client.imageSnipes, message.channel.id, {
      imageURL: message.attachments.first().proxyURL,
      author: message.author.tag,
      avatar: message.author.displayAvatarURL({ dynamic: true }),
      timestamp: Date.now(),
    });
  } else {
    pushSnipe(client.snipes, message.channel.id, {
      content: message.content,
      author: message.author.tag,
      avatar: message.author.displayAvatarURL({ dynamic: true }),
      timestamp: Date.now(),
    });
  }
});

// Message edit listener
client.on('messageUpdate', (oldMessage, newMessage) => {
  if (oldMessage.author.bot) return;
  if (oldMessage.content === newMessage.content) return;

  pushSnipe(client.edits, oldMessage.channel.id, {
    oldContent: oldMessage.content,
    newContent: newMessage.content,
    author: oldMessage.author.tag,
    avatar: oldMessage.author.displayAvatarURL({ dynamic: true }),
    timestamp: Date.now(),
  });
});

// Message create -> command handler
client.on('messageCreate', (message) => {
  handleMessage(client, message);
});

// Load commands
loadCommands(client);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Login
client.login(process.env.DISCORD_TOKEN);