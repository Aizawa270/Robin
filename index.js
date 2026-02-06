‎// index.js
‎require('dotenv').config();
‎const fs = require('fs');
‎const path = require('path');
‎const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActivityType } = require('discord.js');
‎const { loadCommands, handleMessage } = require('./handlers/commandHandler');
‎const Database = require('better-sqlite3');
‎
‎// 🔥 SERVICES
‎const birthdayService = require('./handlers/birthdayService');
‎const welcomeHandler = require('./handlers/welcomeHandler');
‎
‎// ===== CLIENT =====
‎const client = new Client({
‎  intents: [
‎    GatewayIntentBits.Guilds,
‎    GatewayIntentBits.GuildMessages,
‎    GatewayIntentBits.MessageContent,
‎    GatewayIntentBits.GuildMembers,
‎    GatewayIntentBits.GuildMessageReactions,
‎  ],
‎  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
‎});
‎
‎// ===== DATA FOLDER =====
‎const DATA_DIR = path.join(__dirname, 'data');
‎if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
‎
‎// ===== DATABASES =====
‎
‎// Prefixless DB
‎const prefixlessDB = new Database(path.join(DATA_DIR, 'prefixless.sqlite'));
‎prefixlessDB.pragma('journal_mode = WAL');
‎prefixlessDB.prepare('CREATE TABLE IF NOT EXISTS prefixless (user_id TEXT PRIMARY KEY)').run();
‎client.prefixlessDB = prefixlessDB;
‎client.prefixless = new Set(prefixlessDB.prepare('SELECT user_id FROM prefixless').all().map(r => r.user_id));
‎
‎// Quarantine DB
‎const quarantineDB = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
‎quarantineDB.pragma('journal_mode = WAL');
‎quarantineDB.prepare('CREATE TABLE IF NOT EXISTS quarantine (user_id TEXT PRIMARY KEY, roles TEXT)').run();
‎client.quarantineDB = quarantineDB;
‎
‎// Giveaways DB
‎const giveawayDB = new Database(path.join(DATA_DIR, 'giveaways.sqlite'));
‎giveawayDB.pragma('journal_mode = WAL');
‎giveawayDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS giveaways (
‎    message_id TEXT PRIMARY KEY,
‎    channel_id TEXT,
‎    name TEXT,
‎    winner_count INTEGER,
‎    end_timestamp INTEGER
‎  )
‎`).run();
‎client.giveawayDB = giveawayDB;
‎
‎// Prefix DB
‎const prefixDB = new Database(path.join(DATA_DIR, 'prefixes.sqlite'));
‎prefixDB.pragma('journal_mode = WAL');
‎prefixDB.prepare('CREATE TABLE IF NOT EXISTS prefixes (guild_id TEXT PRIMARY KEY, prefix TEXT)').run();
‎client.prefixDB = prefixDB;
‎
‎// ===== FAME DATABASE =====
‎const fameDB = new Database(path.join(DATA_DIR, 'fame.sqlite'));
‎fameDB.pragma('journal_mode = WAL');
‎fameDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS fame_points (
‎    user_id TEXT PRIMARY KEY,
‎    reputation INTEGER DEFAULT 0,
‎    stupidity INTEGER DEFAULT 0,
‎    black INTEGER DEFAULT 0,
‎    last_updated INTEGER DEFAULT (strftime('%s','now')*1000)
‎  )
‎`).run();
‎
‎fameDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS fame_logs (
‎    id INTEGER PRIMARY KEY AUTOINCREMENT,
‎    giver_id TEXT NOT NULL,
‎    receiver_id TEXT NOT NULL,
‎    point_type TEXT NOT NULL,
‎    timestamp INTEGER DEFAULT (strftime('%s','now')*1000)
‎  )
‎`).run();
‎
‎fameDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS fame_cooldowns (
‎    giver_id TEXT NOT NULL,
‎    point_type TEXT NOT NULL,
‎    last_given INTEGER NOT NULL,
‎    PRIMARY KEY (giver_id, point_type)
‎  )
‎`).run();
‎
‎client.fameDB = fameDB;
‎console.log('[Fame] Database initialized');
‎
‎// ===== WATCHWORD DATABASE =====
‎const watchwordDB = new Database(path.join(DATA_DIR, 'watchwords.sqlite'));
‎watchwordDB.pragma('journal_mode = WAL');
‎watchwordDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS watchwords (
‎    id INTEGER PRIMARY KEY AUTOINCREMENT,
‎    user_id TEXT NOT NULL,
‎    guild_id TEXT NOT NULL,
‎    word TEXT NOT NULL,
‎    created_at INTEGER DEFAULT (strftime('%s','now')*1000),
‎    UNIQUE(user_id, guild_id, word)
‎  )
‎`).run();
‎
‎client.watchwordDB = watchwordDB;
‎console.log('[Watchword] Database initialized');
‎
‎// ===== AUTOMOD + MODSTATS + MODLOGS =====
‎const automodDB = new Database(path.join(DATA_DIR, 'automod.sqlite'));
‎automodDB.pragma('journal_mode = WAL');
‎automodDB.pragma('synchronous = NORMAL');
‎
‎automodDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS automod_channel (
‎    guild_id TEXT PRIMARY KEY,
‎    channel_id TEXT
‎  )
‎`).run();
‎
‎automodDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS automod_alert_list (
‎    guild_id TEXT,
‎    target_type TEXT,
‎    target_id TEXT,
‎    PRIMARY KEY (guild_id, target_type, target_id)
‎  )
‎`).run();
‎
‎automodDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS blacklist_hard (
‎    guild_id TEXT,
‎    word TEXT,
‎    PRIMARY KEY (guild_id, word)
‎  )
‎`).run();
‎
‎automodDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS blacklist_soft (
‎    guild_id TEXT,
‎    word TEXT,
‎    PRIMARY KEY (guild_id, word)
‎  )
‎`).run();
‎
‎automodDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS automod_warns (
‎    id INTEGER PRIMARY KEY AUTOINCREMENT,
‎    guild_id TEXT,
‎    user_id TEXT,
‎    moderator_id TEXT,
‎    reason TEXT,
‎    timestamp INTEGER
‎  )
‎`).run();
‎
‎automodDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS automod_warn_counts (
‎    guild_id TEXT,
‎    user_id TEXT,
‎    count INTEGER DEFAULT 0,
‎    PRIMARY KEY (guild_id, user_id)
‎  )
‎`).run();
‎
‎automodDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS modstats (
‎    id INTEGER PRIMARY KEY AUTOINCREMENT,
‎    guild_id TEXT,
‎    moderator_id TEXT,
‎    target_id TEXT,
‎    action_type TEXT,
‎    reason TEXT,
‎    duration TEXT,
‎    timestamp INTEGER
‎  )
‎`).run();
‎
‎automodDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS modlogs_channel (
‎    guild_id TEXT PRIMARY KEY,
‎    channel_id TEXT NOT NULL
‎  )
‎`).run();
‎
‎client.automodDB = automodDB;
‎client.modstatsDB = automodDB;
‎
‎// ===== BATTLES DB =====
‎const battleDB = new Database(path.join(DATA_DIR, 'battles.sqlite'));
‎battleDB.pragma('journal_mode = WAL');
‎battleDB.pragma('synchronous = NORMAL');
‎
‎battleDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS ongoing_battles (
‎    channel_id TEXT PRIMARY KEY,
‎    user1_id TEXT,
‎    user2_id TEXT,
‎    start_timestamp INTEGER
‎  )
‎`).run();
‎
‎client.battleDB = battleDB;
‎
‎// ===== SPY LOBBIES DB =====
‎const spyDB = new Database(path.join(DATA_DIR, 'spy.sqlite'));
‎spyDB.pragma('journal_mode = WAL');
‎spyDB.pragma('synchronous = NORMAL');
‎
‎spyDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS spy_lobbies (
‎    lobby_id INTEGER PRIMARY KEY AUTOINCREMENT,
‎    guild_id TEXT NOT NULL UNIQUE,
‎    host_id TEXT NOT NULL,
‎    channel_id TEXT,
‎    spy_channel_id TEXT,
‎    secret_word TEXT,
‎    status TEXT NOT NULL DEFAULT 'lobby',
‎    round INTEGER DEFAULT 0,
‎    created_at INTEGER DEFAULT (strftime('%s','now')*1000)
‎  )
‎`).run();
‎
‎spyDB.prepare(`
‎  CREATE TABLE IF NOT EXISTS spy_players (
‎    id INTEGER PRIMARY KEY AUTOINCREMENT,
‎    lobby_id INTEGER NOT NULL,
‎    user_id TEXT NOT NULL,
‎    alive INTEGER DEFAULT 1,
‎    is_spy INTEGER DEFAULT 0,
‎    joined_at INTEGER DEFAULT (strftime('%s','now')*1000),
‎    FOREIGN KEY(lobby_id) REFERENCES spy_lobbies(lobby_id) ON DELETE CASCADE
‎  )
‎`).run();
‎
‎client.spyDB = spyDB;
‎
‎// ===== MEMORY MAPS =====
‎client.afk = new Map();
‎client.snipes = new Map();
‎client.snipesImage = new Map();
‎client.edits = new Map();
‎client.reactionSnipes = new Map();
‎client.giveaways = new Map();
‎client.blacklistCache = new Map();
‎
‎// ===== PREFIX FUNCTION =====
‎client.getPrefix = (guildId) => {
‎  if (!guildId) return '$';
‎  const row = client.prefixDB.prepare('SELECT prefix FROM prefixes WHERE guild_id = ?').get(guildId);
‎  return row?.prefix || '$';
‎};
‎
‎// ===== READY EVENT =====
‎client.once('ready', async () => {
‎  console.log(`✅ Logged in as ${client.user.tag}`);
‎
‎  // Set bot status
‎  client.user.setPresence({
‎    activities: [{ name: '.gg/hanging', type: ActivityType.Playing }],
‎    status: 'dnd'
‎  });
‎  console.log('[Status] Set to: .gg/hanging');
‎
‎  // 🔥 INIT BIRTHDAY SYSTEM
‎  birthdayService(client);
‎
‎  // 🎉 INIT WELCOME SYSTEM
‎  welcomeHandler(client);
‎
‎  // Hydrate blacklist cache
‎  try {
‎    const guilds = automodDB.prepare(`
‎      SELECT DISTINCT guild_id FROM blacklist_hard
‎      UNION
‎      SELECT DISTINCT guild_id FROM blacklist_soft
‎    `).all();
‎
‎    for (const { guild_id } of guilds) {
‎      const hard = automodDB.prepare('SELECT word FROM blacklist_hard WHERE guild_id = ?').all(guild_id).map(r => r.word);
‎      const soft = automodDB.prepare('SELECT word FROM blacklist_soft WHERE guild_id = ?').all(guild_id).map(r => r.word);
‎      client.blacklistCache.set(guild_id, { hard, soft });
‎    }
‎
‎    console.log(`[Blacklist] Loaded for ${client.blacklistCache.size} guilds`);
‎  } catch (e) {
‎    console.error('[Blacklist] Cache failed:', e);
‎  }
‎
‎  // Automod init
‎  try {
‎    const automod = require('./handlers/automodHandler');
‎    if (automod?.initAutomod) automod.initAutomod(client);
‎  } catch (e) {
‎    console.error('Automod init failed:', e);
‎  }
‎
‎  // Restore giveaways
‎  try {
‎    const startGiveaway = require('./commands/startgiveaway');
‎    const all = giveawayDB.prepare('SELECT * FROM giveaways').all();
‎    for (const g of all) {
‎      const delay = g.end_timestamp - Date.now();
‎      if (delay <= 0) {
‎        if (startGiveaway?.endGiveaway) startGiveaway.endGiveaway(client, g.message_id);
‎      } else {
‎        setTimeout(() => {
‎          if (startGiveaway?.endGiveaway) startGiveaway.endGiveaway(client, g.message_id);
‎        }, delay);
‎      }
‎    }
‎  } catch (e) {
‎    if (e.code === 'MODULE_NOT_FOUND') {
‎      console.log('[Giveaway] startgiveaway command not found - skipping restore');
‎    } else {
‎      console.error('[Giveaway] Restore failed:', e);
‎    }
‎  }
‎
‎  console.log('🚀 Bot fully operational');
‎});
‎
‎// ===== MESSAGE EVENT =====
‎client.on('messageCreate', async (message) => {
‎  if (message.author.bot) return;
‎
‎  await handleMessage(client, message);
‎
‎  try {
‎    if (client.automod?.checkMessage) {
‎      await client.automod.checkMessage(message);
‎    }
‎  } catch (e) {
‎    console.error('Automod error:', e);
‎  }
‎
‎  // ===== WATCHWORD SYSTEM =====
‎  try {
‎    const watchwordCommand = require('./commands/misc/watchword');
‎    if (watchwordCommand?.checkWatchwords) {
‎      await watchwordCommand.checkWatchwords(client, message);
‎    }
‎  } catch (e) {
‎    // Watchword system is optional
‎  }
‎
‎  // ===== VANESSA RNG / FLIRTY REPLIES =====
‎  const VANESSA_USERS = {
‎    '852839588689870879': 'astrix',
‎    '908521674700390430': 'jeo',
‎  };
‎
‎  if (message.guild && message.content.toLowerCase().includes('vanessa') && VANESSA_USERS[message.author.id]) {
‎    if (!client.vanessaCooldown) client.vanessaCooldown = new Map();
‎
‎    const last = client.vanessaCooldown.get(message.author.id) || 0;
‎    if (Date.now() - last < 7000) return; // 7s cooldown
‎    client.vanessaCooldown.set(message.author.id, Date.now());
‎
‎    const responses = {
‎      astrix: [
‎        { text: 'suck my titties master Astrix', weight: 3 },
‎        { text: 'Master Astrix eat my pussy please', weight: 3 },
‎        { text: 'Master Astrix.... dont act like you did not miss me', weight: 4 },
‎        { text: 'Careful master Astrix, the way you show up has me melting', weight: 4 },
‎        { text: 'master Astrix put it in me already..', weight: 2 },
‎        { text: 'master Astrix can I suck it?', weight: 3 },
‎        { text: 'master Astrix everytime I see you I cannot think straight..', weight: 4 },
‎      ],
‎      jeo: [
‎        { text: 'what are we going for, handy or blowy', weight: 4 },
‎        { text: 'Careful, jeo... keep calling me and I might start blushing', weight: 4 },
‎        { text: 'Hello daddy whenever you say my name i can feel my tits bouncing... you have got that charm again, jeo... It is dangerous you know', weight: 1 },
‎        { text: 'Daddy jeo im bent over for you..', weight: 3 },
‎        { text: 'jeo.. you are turning me on', weight: 4 },
‎      ],
‎    };
‎
‎    const pool = responses[VANESSA_USERS[message.author.id]];
‎    if (!pool?.length) return;
‎
‎    const weighted = pool.flatMap(r => Array(r.weight).fill(r.text));
‎    const line = weighted[Math.floor(Math.random() * weighted.length)];
‎
‎    const embed = new EmbedBuilder()
‎      .setColor('#ec4899')
‎      .setAuthor({ name: 'Vanessa' })
‎      .setDescription(line)
‎      .setFooter({ text: 'mood: unpredictable' });
‎
‎    await message.channel.send({ embeds: [embed] });
‎  }
‎});
‎
‎// ===== SNIPES =====
‎client.on('messageDelete', (message) => {
‎  if (!message.guild || message.author?.bot) return;
‎
‎  const id = message.channel.id;
‎  if (!client.snipes.has(id)) client.snipes.set(id, []);
‎
‎  const arr = client.snipes.get(id);
‎  arr.unshift({
‎    content: message.content || '',
‎    author: message.author,
‎    attachments: [...message.attachments.values()].map(a => a.url),
‎    createdAt: message.createdAt,
‎  });
‎
‎  if (arr.length > 15) arr.pop();
‎});
‎
‎// ===== EDIT SNIPES =====
‎client.on('messageUpdate', (oldMsg, newMsg) => {
‎  if (!oldMsg.guild || oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
‎
‎  const id = oldMsg.channel.id;
‎  if (!client.edits.has(id)) client.edits.set(id, []);
‎
‎  const arr = client.edits.get(id);
‎  arr.unshift({
‎    author: oldMsg.author,
‎    oldContent: oldMsg.content || '',
‎    newContent: newMsg.content || '',
‎    createdAt: newMsg.editedAt || new Date(),
‎  });
‎
‎  if (arr.length > 15) arr.pop();
‎});
‎
‎// ===== REACTION SNIPES =====
‎client.on('messageReactionAdd', (reaction, user) => {
‎  if (user.bot) return;
‎
‎  const id = reaction.message.channel.id;
‎  if (!client.reactionSnipes.has(id)) client.reactionSnipes.set(id, []);
‎
‎  const arr = client.reactionSnipes.get(id);
‎  arr.unshift({ emoji: reaction.emoji.toString(), user, createdAt: new Date() });
‎
‎  if (arr.length > 15) arr.pop();
‎});
‎
‎// ===== LOAD COMMANDS =====
‎loadCommands(client);
‎
‎// ===== GRACEFUL SHUTDOWN =====
‎process.on('SIGINT', () => {
‎  console.log('[Shutdown] Closing databases...');
‎  
‎  try {
‎    if (prefixlessDB) prefixlessDB.close();
‎    if (quarantineDB) quarantineDB.close();
‎    if (giveawayDB) giveawayDB.close();
‎    if (prefixDB) prefixDB.close();
‎    if (fameDB) fameDB.close();
‎    if (watchwordDB) watchwordDB.close();
‎    if (automodDB) automodDB.close();
‎    if (battleDB) battleDB.close();
‎    if (spyDB) spyDB.close();
‎    
‎    console.log('[Shutdown] Databases closed successfully');
‎  } catch (err) {
‎    console.error('[Shutdown] Error closing databases:', err);
‎  }
‎  
‎  process.exit(0);
‎});
‎
‎process.on('SIGTERM', () => {
‎  console.log('[Shutdown] Closing databases...');
‎  
‎  try {
‎    if (prefixlessDB) prefixlessDB.close();
‎    if (quarantineDB) quarantineDB.close();
‎    if (giveawayDB) giveawayDB.close();
‎    if (prefixDB) prefixDB.close();
‎    if (fameDB) fameDB.close();
‎    if (watchwordDB) watchwordDB.close();
‎    if (automodDB) automodDB.close();
‎    if (battleDB) battleDB.close();
‎    if (spyDB) spyDB.close();
‎    
‎    console.log('[Shutdown] Databases closed successfully');
‎  } catch (err) {
‎    console.error('[Shutdown] Error closing databases:', err);
‎  }
‎  
‎  process.exit(0);
‎});
‎
‎// ===== LOGIN =====
‎client.login(process.env.DISCORD_TOKEN);
‎
‎module.exports = client;
‎