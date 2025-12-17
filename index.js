require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
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
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// AFK storage
client.afk = new Map(); // userId -> { reason, since }

// Prefixless storage
try {
  const data = fs.readFileSync(PREFIXLESS_FILE, 'utf8');
  client.prefixless = new Set(JSON.parse(data));
} catch {
  client.prefixless = new Set(defaultPrefixless || []);
}
client.savePrefixless = () => {
  fs.writeFileSync(PREFIXLESS_FILE, JSON.stringify([...client.prefixless]));
};

// --- Snipes storage (up to 15 messages per channel)
client.snipes = new Map();
client.edits = new Map(); // edited messages

client.on('messageDelete', message => {
  if (!message.guild) return;
  const channelId = message.channel.id;
  const entry = {
    content: message.content,
    author: message.author,
    attachments: message.attachments.map(a => a.url),
    createdAt: Date.now(),
  };
  if (!client.snipes.has(channelId)) client.snipes.set(channelId, []);
  const arr = client.snipes.get(channelId);
  arr.unshift(entry);
  if (arr.length > 15) arr.pop();
  client.snipes.set(channelId, arr);
});

client.on('messageUpdate', (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.author.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const channelId = oldMessage.channel.id;
  const entry = {
    oldContent: oldMessage.content,
    newContent: newMessage.content,
    author: oldMessage.author,
    createdAt: Date.now(),
  };
  if (!client.edits.has(channelId)) client.edits.set(channelId, []);
  const arr = client.edits.get(channelId);
  arr.unshift(entry);
  if (arr.length > 15) arr.pop();
  client.edits.set(channelId, arr);
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', message => {
  handleMessage(client, message);
});

loadCommands(client);

client.login(process.env.DISCORD_TOKEN);