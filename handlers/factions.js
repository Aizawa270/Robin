// handlers/factions.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'factions.sqlite');
const db = new Database(dbPath);

// PRAGMA for durability
try {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
} catch (e) {
  console.warn('Could not set PRAGMA on factions DB:', e?.message || e);
}

// Create tables
db.prepare(`
CREATE TABLE IF NOT EXISTS factions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  coleader_id TEXT DEFAULT NULL,
  vice1_id TEXT DEFAULT NULL,
  vice2_id TEXT DEFAULT NULL,
  is_private INTEGER DEFAULT 0,
  banner_url TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL,
  private_started INTEGER DEFAULT 0
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS faction_members (
  faction_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member', -- member, vice, coleader, owner
  joined_at INTEGER NOT NULL,
  banned INTEGER DEFAULT 0,
  PRIMARY KEY (faction_id, user_id)
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS faction_vault (
  faction_id INTEGER PRIMARY KEY,
  total INTEGER DEFAULT 0
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS faction_invites (
  faction_id INTEGER NOT NULL,
  invitee_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (faction_id, invitee_id)
)
`).run();

// helper functions
function createFaction(guildId, name, ownerId, isPrivate = 0, banner = null) {
  const createdAt = Date.now();
  const info = db.prepare(`
    INSERT INTO factions (guild_id, name, owner_id, is_private, banner_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, name, ownerId, isPrivate ? 1 : 0, banner, createdAt);
  const factionId = info.lastInsertRowid;
  // add owner as member role owner
  db.prepare(`
    INSERT INTO faction_members (faction_id, user_id, role, joined_at)
    VALUES (?, ?, 'owner', ?)
  `).run(factionId, ownerId, createdAt);
  // ensure vault row
  db.prepare(`INSERT OR IGNORE INTO faction_vault (faction_id, total) VALUES (?, 0)`).run(factionId);
  return getFactionById(factionId);
}

function getFactionById(factionId) {
  return db.prepare(`SELECT * FROM factions WHERE id = ?`).get(factionId);
}

function getFactionByName(guildId, name) {
  return db.prepare(`SELECT * FROM factions WHERE guild_id = ? AND lower(name) = ?`).get(guildId, name.toLowerCase());
}

function listFactions(guildId) {
  return db.prepare(`SELECT id, name, owner_id, is_private, banner_url, created_at FROM factions WHERE guild_id = ?`).all(guildId);
}

function addMember(factionId, userId, role = 'member') {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO faction_members (faction_id, user_id, role, joined_at, banned)
    VALUES (?, ?, ?, ?, 0)
  `).run(factionId, userId, role, now);
}

function removeMember(factionId, userId) {
  db.prepare(`DELETE FROM faction_members WHERE faction_id = ? AND user_id = ?`).run(factionId, userId);
}

function getMember(factionId, userId) {
  return db.prepare(`SELECT * FROM faction_members WHERE faction_id = ? AND user_id = ?`).get(factionId, userId);
}

function getMembers(factionId) {
  return db.prepare(`SELECT user_id, role, joined_at FROM faction_members WHERE faction_id = ? AND banned = 0`).all(factionId);
}

function banMember(factionId, userId) {
  db.prepare(`UPDATE faction_members SET banned = 1 WHERE faction_id = ? AND user_id = ?`).run(factionId, userId);
}

function unbanMember(factionId, userId) {
  db.prepare(`UPDATE faction_members SET banned = 0 WHERE faction_id = ? AND user_id = ?`).run(factionId, userId);
}

function saveBanner(factionId, url) {
  db.prepare(`UPDATE factions SET banner_url = ? WHERE id = ?`).run(url, factionId);
}

function promoteMember(factionId, userId, newRole) {
  const valid = ['member','vice','coleader','owner'];
  if (!valid.includes(newRole)) throw new Error('invalid role');
  db.prepare(`UPDATE faction_members SET role = ? WHERE faction_id = ? AND user_id = ?`).run(newRole, factionId, userId);
  // also update owner/coleader/vice fields on factions table for quick lookup if needed
  // keep it simple: when promoting to owner, set factions.owner_id
  if (newRole === 'owner') {
    db.prepare(`UPDATE factions SET owner_id = ? WHERE id = ?`).run(userId, factionId);
  }
}

function contributeVault(factionId, amount) {
  db.prepare(`INSERT OR REPLACE INTO faction_vault (faction_id, total) VALUES (?, COALESCE((SELECT total FROM faction_vault WHERE faction_id = ?),0) + ?)`).run(factionId, factionId, amount);
}

function getVault(factionId) {
  return db.prepare(`SELECT total FROM faction_vault WHERE faction_id = ?`).get(factionId)?.total || 0;
}

function createInvite(factionId, inviteeId, inviterId) {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO faction_invites (faction_id, invitee_id, inviter_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(factionId, inviteeId, inviterId, now);
}

function getInvite(factionId, inviteeId) {
  return db.prepare(`SELECT * FROM faction_invites WHERE faction_id = ? AND invitee_id = ?`).get(factionId, inviteeId);
}

function deleteInvite(factionId, inviteeId) {
  db.prepare(`DELETE FROM faction_invites WHERE faction_id = ? AND invitee_id = ?`).run(factionId, inviteeId);
}

// Exports
module.exports = {
  db,
  createFaction,
  getFactionById,
  getFactionByName,
  listFactions,
  addMember,
  removeMember,
  getMember,
  getMembers,
  banMember,
  unbanMember,
  saveBanner,
  promoteMember,
  contributeVault,
  getVault,
  createInvite,
  getInvite,
  deleteInvite
};