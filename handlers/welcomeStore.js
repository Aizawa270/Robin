const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'welcome.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.prepare(`
  CREATE TABLE IF NOT EXISTS welcome_settings (
    guild_id TEXT PRIMARY KEY,

    welcome_channel_id TEXT,
    rules_channel_id TEXT,
    info_channel_id TEXT,
    chat_channel_id TEXT,
    welcome_image_url TEXT,

    welcome_chat_channel_id TEXT,

    redirect_channel_ids TEXT DEFAULT '[]',
    ping_channel_id TEXT
  )
`).run();

// Migration: add redirect_channel_ids if old DB doesn't have it yet
const columns = new Set(
  db.prepare(`PRAGMA table_info(welcome_settings)`).all().map(r => r.name)
);

if (!columns.has('redirect_channel_ids')) {
  db.prepare(`ALTER TABLE welcome_settings ADD COLUMN redirect_channel_ids TEXT DEFAULT '[]'`).run();
}

const ALLOWED_COLUMNS = new Set([
  'welcome_channel_id',
  'rules_channel_id',
  'info_channel_id',
  'chat_channel_id',
  'welcome_image_url',
  'welcome_chat_channel_id',
  'redirect_channel_ids',
  'ping_channel_id',
]);

function ensureRow(guildId) {
  db.prepare(`
    INSERT OR IGNORE INTO welcome_settings (guild_id)
    VALUES (?)
  `).run(guildId);
}

function getSettings(guildId) {
  ensureRow(guildId);
  return db.prepare(`
    SELECT *
    FROM welcome_settings
    WHERE guild_id = ?
  `).get(guildId);
}

function setSetting(guildId, column, value) {
  if (!ALLOWED_COLUMNS.has(column)) {
    throw new Error(`Invalid welcome setting: ${column}`);
  }

  ensureRow(guildId);

  db.prepare(`
    UPDATE welcome_settings
    SET ${column} = ?
    WHERE guild_id = ?
  `).run(value, guildId);
}

function parseChannelIdList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean).map(String);
  } catch {
    return [];
  }
}

function close() {
  try {
    if (db.open) db.close();
  } catch {}
}

module.exports = {
  db,
  getSettings,
  setSetting,
  parseChannelIdList,
  close,
};