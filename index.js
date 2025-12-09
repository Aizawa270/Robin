require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// AFK + prefixless storage
client.afk = new Map();        // userId -> { reason, since }
client.prefixless = new Set(); // userIds who can use prefixless commands

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  handleMessage(client, message);
});

loadCommands(client);

client.login(process.env.DISCORD_TOKEN);