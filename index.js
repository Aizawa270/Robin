require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const { defaultPrefixless } = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// AFK + prefixless storage
client.afk = new Map();                      // userId -> { reason, since }
client.prefixless = new Set(defaultPrefixless || []); // always start with IDs from config

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  handleMessage(client, message);
});

loadCommands(client);

client.login(process.env.DISCORD_TOKEN);