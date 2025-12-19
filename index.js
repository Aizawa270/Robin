require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
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
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ===== DATABASES =====
const giveawayDB = new Database(path.join(DATA_DIR, 'giveaways.sqlite'));
giveawayDB.prepare(`
  CREATE TABLE IF NOT EXISTS giveaways (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT,
    name TEXT,
    winner_count INTEGER,
    end_timestamp INTEGER
  )
`).run();
client.giveawayDB = giveawayDB;

// ===== MEMORY MAPS =====
client.giveaways = new Map();  // messageId => {participants: Set, ...}

// ===== REACTION ADD =====
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();

  const giveaway = client.giveawayDB.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(reaction.message.id);
  if (!giveaway) return;

  if (!client.giveaways.has(reaction.message.id)) {
    client.giveaways.set(reaction.message.id, { participants: new Set() });
  }
  const g = client.giveaways.get(reaction.message.id);

  if (g.participants.has(user.id)) {
    // Already in -> ask confirmation to leave
    try {
      await user.send(`You reacted again to leave the giveaway **${giveaway.name}**. Reply "yes" to leave or "no" to stay.`);
      const filter = m => m.author.id === user.id && ['yes','no'].includes(m.content.toLowerCase());
      const dm = await user.createDM();
      const collected = await dm.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
      const reply = collected.first().content.toLowerCase();
      if (reply === 'yes') {
        g.participants.delete(user.id);
        await reaction.users.remove(user.id);
        await user.send(`You have left the giveaway **${giveaway.name}**.`);
      } else {
        await user.send(`You are still in the giveaway **${giveaway.name}**.`);
      }
    } catch {
      await user.send('No response. You remain in the giveaway.');
    }
  } else {
    // Add to giveaway
    g.participants.add(user.id);
  }
});

// ===== REACTION REMOVE (Live tracking is automatic) =====
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();

  const g = client.giveaways.get(reaction.message.id);
  if (g) g.participants.delete(user.id); // leave if they manually remove
});

// ===== READY =====
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Resume giveaways
  const all = client.giveawayDB.prepare('SELECT * FROM giveaways').all();
  for (const g of all) {
    const delay = g.end_timestamp - Date.now();
    if (delay <= 0) {
      require('./commands/startgiveaway').endGiveaway(client, g.message_id);
    } else {
      setTimeout(() => require('./commands/startgiveaway').endGiveaway(client, g.message_id), delay);
    }
  }
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
module.exports = client;