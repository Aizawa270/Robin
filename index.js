require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
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

// Prefixless DB
const prefixlessDB = new Database(path.join(DATA_DIR, 'prefixless.sqlite'));
prefixlessDB.prepare('CREATE TABLE IF NOT EXISTS prefixless (user_id TEXT PRIMARY KEY)').run();
client.prefixlessDB = prefixlessDB;
client.prefixless = new Set(prefixlessDB.prepare('SELECT user_id FROM prefixless').all().map(r => r.user_id));

// Quarantine DB
const quarantineDB = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
quarantineDB.prepare('CREATE TABLE IF NOT EXISTS quarantine (user_id TEXT PRIMARY KEY, roles TEXT)').run();
client.quarantineDB = quarantineDB;

// Giveaways DB
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

// Prefixes DB (per-server)
const prefixDB = new Database(path.join(DATA_DIR, 'prefixes.sqlite'));
prefixDB.prepare('CREATE TABLE IF NOT EXISTS prefixes (guild_id TEXT PRIMARY KEY, prefix TEXT)').run();
client.prefixDB = prefixDB;

// ===== MEMORY MAPS =====
client.afk = new Map();
client.snipes = new Map();
client.snipesImage = new Map();
client.edits = new Map();
client.reactionSnipes = new Map();
client.giveaways = new Map();

// ===== MESSAGE DELETE =====
client.on('messageDelete', async (message) => {
  if (!message.guild) return;
  if (message.partial) {
    try { message = await message.fetch(); } catch { return; }
  }
  if (!message.content && message.attachments.size === 0) return;
  if (message.author?.bot) return;

  const channelId = message.channel.id;

  if (!client.snipes.has(channelId)) client.snipes.set(channelId, []);
  const arr = client.snipes.get(channelId);
  arr.unshift({
    content: message.content || '',
    author: message.author,
    attachments: [...message.attachments.values()].map(a => a.url),
    createdAt: message.createdAt,
  });
  if (arr.length > 15) arr.pop();

  if (message.attachments.size > 0) {
    if (!client.snipesImage.has(channelId)) client.snipesImage.set(channelId, []);
    const imgArr = client.snipesImage.get(channelId);
    imgArr.unshift({
      content: message.content || '',
      author: message.author,
      attachments: [...message.attachments.values()].map(a => a.url),
      createdAt: message.createdAt,
    });
    if (imgArr.length > 15) imgArr.pop();
  }
});

// ===== MESSAGE UPDATE =====
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!oldMsg.guild) return;
  if (oldMsg.partial) {
    try { oldMsg = await oldMsg.fetch(); } catch { return; }
  }
  if (oldMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;

  const channelId = oldMsg.channel.id;
  if (!client.edits.has(channelId)) client.edits.set(channelId, []);
  const arr = client.edits.get(channelId);
  arr.unshift({
    author: oldMsg.author,
    oldContent: oldMsg.content || '',
    newContent: newMsg.content || '',
    createdAt: newMsg.editedAt || new Date(),
  });
  if (arr.length > 15) arr.pop();
});

// ===== REACTIONS =====
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch {}
  }

  const channelId = reaction.message.channel.id;
  if (!client.reactionSnipes.has(channelId)) client.reactionSnipes.set(channelId, []);
  const arr = client.reactionSnipes.get(channelId);
  arr.unshift({ emoji: reaction.emoji.toString(), user, createdAt: new Date() });
  if (arr.length > 15) arr.pop();
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch {}
  }
});

// ===== DYNAMIC PREFIX =====
client.getPrefix = (guildId) => {
  if (!guildId) return '$';
  try {
    const row = client.prefixDB.prepare('SELECT prefix FROM prefixes WHERE guild_id = ?').get(guildId);
    return row?.prefix || '$';
  } catch (err) {
    console.error('getPrefix error:', err);
    return '$';
  }
};

// ===== READY =====
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

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

// ===== MESSAGE CREATE (COMMAND HANDLER + AUTOMOD) =====
if (!client.messageCreateHandlerAttached) {
  client.on('messageCreate', async (message) => {
    await handleMessage(client, message);

    try {
      const am = require('./handlers/automodHandler');
      if (am && am.db && am.initAutomod) {
        const softWords = am.db.prepare('SELECT word FROM blacklist_soft WHERE guild_id = ?').all(message.guild?.id || '');
        for (const w of softWords) {
          if (!w.word) continue;
          if (message.content.toLowerCase().includes(w.word.toLowerCase())) {
            await message.delete().catch(() => {});
            break;
          }
        }

        const hardWords = am.db.prepare('SELECT word FROM blacklist_hard WHERE guild_id = ?').all(message.guild?.id || '');
        for (const w of hardWords) {
          if (!w.word) continue;
          if (message.content.toLowerCase().includes(w.word.toLowerCase())) {
            await message.delete().catch(() => {});

            const member = await message.guild.members.fetch(message.author.id).catch(() => null);
            if (member && !member.permissions.has(PermissionsBitField.Flags.Administrator) && member.moderatable) {
              await member.timeout(15 * 60 * 1000, `Triggered hard blacklist word: ${w.word}`).catch(err => console.error('Timeout error:', err));
            }

            if (am.initAutomod) await am.initAutomod(client);
            if (am.db) {
              const automodModule = require('./handlers/automodHandler');
              if (automodModule && automodModule.initAutomod) {
                if (automodModule.automod && automodModule.automod.checkMessage) {
                  await automodModule.automod.checkMessage(client, message).catch(() => {});
                }
              }
            }
            break;
          }
        }
      }
    } catch (e) {
      console.error('Automod index.js error:', e);
    }
  });
  client.messageCreateHandlerAttached = true;
}

// ===== LOAD COMMANDS =====
loadCommands(client);

// ===== AUTOMOD HANDLER INIT =====
try {
  const am = require('./handlers/automodHandler');
  if (am && typeof am.initAutomod === 'function') am.initAutomod(client);
} catch (e) {
  console.warn('Failed to init automod handler (ignored):', e);
}

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);

module.exports = client;