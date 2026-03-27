require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActivityType } = require('discord.js');
const { loadCommands, handleMessage } = require('./handlers/commandHandler');
const { handleButtonInteraction: handle1v1Button } = require('./commands/misc/1v1');
const { restoreReminders } = require('./commands/misc/remind');
const Database = require('better-sqlite3');

// 🔥 SERVICES
const birthdayService = require('./handlers/birthdayService');
const welcomeHandler = require('./handlers/welcomeHandler');

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

// ===== DATA FOLDER =====
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ===== DATABASES =====
const prefixlessDB = new Database(path.join(DATA_DIR, 'prefixless.sqlite'));
prefixlessDB.pragma('journal_mode = WAL');
prefixlessDB.prepare('CREATE TABLE IF NOT EXISTS prefixless (user_id TEXT PRIMARY KEY)').run();
client.prefixlessDB = prefixlessDB;
client.prefixless = new Set(prefixlessDB.prepare('SELECT user_id FROM prefixless').all().map(r => r.user_id));

const quarantineDB = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
quarantineDB.pragma('journal_mode = WAL');
quarantineDB.prepare('CREATE TABLE IF NOT EXISTS quarantine (user_id TEXT PRIMARY KEY, roles TEXT)').run();
client.quarantineDB = quarantineDB;

const giveawayDB = new Database(path.join(DATA_DIR, 'giveaways.sqlite'));
giveawayDB.pragma('journal_mode = WAL');
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

const prefixDB = new Database(path.join(DATA_DIR, 'prefixes.sqlite'));
prefixDB.pragma('journal_mode = WAL');
prefixDB.prepare('CREATE TABLE IF NOT EXISTS prefixes (guild_id TEXT PRIMARY KEY, prefix TEXT)').run();
client.prefixDB = prefixDB;

const fameDB = new Database(path.join(DATA_DIR, 'fame.sqlite'));
fameDB.pragma('journal_mode = WAL');
client.fameDB = fameDB;

const watchwordDB = new Database(path.join(DATA_DIR, 'watchwords.sqlite'));
watchwordDB.pragma('journal_mode = WAL');
client.watchwordDB = watchwordDB;

const automodDB = new Database(path.join(DATA_DIR, 'automod.sqlite'));
automodDB.pragma('journal_mode = WAL');
client.automodDB = automodDB;
client.modstatsDB = automodDB;

const battleDB = new Database(path.join(DATA_DIR, 'battles.sqlite'));
battleDB.pragma('journal_mode = WAL');
client.battleDB = battleDB;

const spyDB = new Database(path.join(DATA_DIR, 'spy.sqlite'));
spyDB.pragma('journal_mode = WAL');
client.spyDB = spyDB;

// ===== MEMORY =====
client.afk = new Map();
client.snipes = new Map();
client.edits = new Map();
client.reactionSnipes = new Map();
client.giveaways = new Map();
client.blacklistCache = new Map();

// ===== PREFIX =====
client.getPrefix = (guildId) => {
  if (!guildId) return '$';
  const row = client.prefixDB.prepare('SELECT prefix FROM prefixes WHERE guild_id = ?').get(guildId);
  return row?.prefix || '$';
};

// ===== READY =====
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: '.gg/hanging', type: ActivityType.Playing }],
    status: 'dnd'
  });

  birthdayService(client);
  welcomeHandler(client);

  // Restore any reminders that were pending before the bot restarted
  restoreReminders(client);

  console.log('🚀 Bot fully operational');
});

// ===== MESSAGE =====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  await handleMessage(client, message);
});

// ===== BUTTON HANDLER =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (
    interaction.customId.startsWith('1v1_accept_') ||
    interaction.customId.startsWith('1v1_deny_')
  ) {
    try {
      await handle1v1Button(interaction);
    } catch (err) {
      console.error('[1v1 Button]', err);
      if (!interaction.replied && !interaction.deferred) {
        interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
      }
    }
  }
});

// ===== LOAD COMMANDS =====
loadCommands(client);

// ===== SHUTDOWN =====
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);

module.exports = client;
