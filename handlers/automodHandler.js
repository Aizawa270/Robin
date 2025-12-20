const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'automod.sqlite');
const db = new Database(dbPath);

// ===== TABLES =====
db.prepare(`
  CREATE TABLE IF NOT EXISTS blacklist (
    guild_id TEXT,
    word TEXT,
    type TEXT CHECK(type IN ('trigger','soft')),
    PRIMARY KEY (guild_id, word)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS automod_alert (
    guild_id TEXT,
    user_id TEXT,
    PRIMARY KEY (guild_id, user_id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS automod_alert_role (
    guild_id TEXT,
    role_id TEXT,
    PRIMARY KEY (guild_id, role_id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS automod_channel (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT
  )
`).run();

// ===== HELPERS =====
function addBlacklistWord(guildId, word, type = 'trigger') {
  db.prepare(`INSERT OR REPLACE INTO blacklist (guild_id, word, type) VALUES (?, ?, ?)`)
    .run(guildId, word.toLowerCase(), type);
}

function removeBlacklistWord(guildId, word) {
  db.prepare(`DELETE FROM blacklist WHERE guild_id = ? AND word = ?`)
    .run(guildId, word.toLowerCase());
}

function getBlacklist(guildId) {
  return db.prepare(`SELECT word, type FROM blacklist WHERE guild_id = ?`).all(guildId);
}

function setAutomodChannel(guildId, channelId) {
  db.prepare(`INSERT OR REPLACE INTO automod_channel (guild_id, channel_id) VALUES (?, ?)`)
    .run(guildId, channelId);
}

function removeAutomodChannel(guildId) {
  db.prepare(`DELETE FROM automod_channel WHERE guild_id = ?`).run(guildId);
}

function getAutomodChannel(guildId) {
  const row = db.prepare(`SELECT channel_id FROM automod_channel WHERE guild_id = ?`).get(guildId);
  return row?.channel_id;
}

function addAutomodAlertUser(guildId, userId) {
  db.prepare(`INSERT OR REPLACE INTO automod_alert (guild_id, user_id) VALUES (?, ?)`).run(guildId, userId);
}

function removeAutomodAlertUser(guildId, userId) {
  db.prepare(`DELETE FROM automod_alert WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
}

function addAutomodAlertRole(guildId, roleId) {
  db.prepare(`INSERT OR REPLACE INTO automod_alert_role (guild_id, role_id) VALUES (?, ?)`).run(guildId, roleId);
}

function removeAutomodAlertRole(guildId, roleId) {
  db.prepare(`DELETE FROM automod_alert_role WHERE guild_id = ? AND role_id = ?`).run(guildId, roleId);
}

function getAutomodAlertUsers(guildId) {
  return db.prepare(`SELECT user_id FROM automod_alert WHERE guild_id = ?`).all(guildId).map(r => r.user_id);
}

function getAutomodAlertRoles(guildId) {
  return db.prepare(`SELECT role_id FROM automod_alert_role WHERE guild_id = ?`).all(guildId).map(r => r.role_id);
}

// ===== MAIN CHECK FUNCTION =====
async function checkMessage(client, message) {
  if (!message.guild || message.author.bot) return;

  const content = message.content.toLowerCase();

  // Fetch blacklist
  const blacklist = getBlacklist(message.guild.id);

  // ===== SOFT DELETE =====
  for (const { word, type } of blacklist) {
    if (type === 'soft' && content.includes(word)) {
      try { await message.delete(); } catch {}
      return; // Soft deleted, no automod alert
    }
  }

  // ===== TRIGGER WORDS =====
  let triggered = false;

  // Check trigger words
  for (const { word, type } of blacklist) {
    if (type === 'trigger' && content.includes(word)) {
      triggered = true;
      break;
    }
  }

  // ===== DISCORD INVITE DETECTION =====
  const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discordapp\.com\/invite)\/[^\s]+/i;
  if (inviteRegex.test(message.content)) triggered = true;

  if (!triggered) return;

  // Delete the message
  try { await message.delete(); } catch {}

  // ===== AUTOMOD ALERT =====
  const channelId = getAutomodChannel(message.guild.id);
  if (!channelId) return;

  const alertChannel = message.guild.channels.cache.get(channelId);
  if (!alertChannel) return;

  const users = getAutomodAlertUsers(message.guild.id);
  const roles = getAutomodAlertRoles(message.guild.id);

  const mentionIds = [...users, ...roles];
  const ghostPing = mentionIds.map(id => `<@${id}>`).join(' ');

  const embed = {
    title: 'Automod Triggered',
    description: `A message was deleted: \`${message.content}\`\nBy: <@${message.author.id}>`,
    color: 0xff0000,
    footer: { text: 'Click an action below to take measures.' },
    timestamp: new Date(),
  };

  alertChannel.send({ content: ghostPing, embeds: [embed] });
}

// ===== EXPORTS =====
module.exports = {
  checkMessage,
  addBlacklistWord,
  removeBlacklistWord,
  getBlacklist,
  setAutomodChannel,
  removeAutomodChannel,
  getAutomodChannel,
  addAutomodAlertUser,
  removeAutomodAlertUser,
  addAutomodAlertRole,
  removeAutomodAlertRole,
  getAutomodAlertUsers,
  getAutomodAlertRoles,
};