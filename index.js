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
  // fallback to default from config if file doesn't exist
  client.prefixless = new Set(defaultPrefixless || []);
}

// Helper: save prefixless whenever it changes
client.savePrefixless = () => {
  fs.writeFileSync(PREFIXLESS_FILE, JSON.stringify([...client.prefixless]));
};

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  handleMessage(client, message);
});

loadCommands(client);

client.login(process.env.DISCORD_TOKEN);