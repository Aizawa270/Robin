const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'gambling.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

function ensureSchema() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS command_cooldowns (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      command TEXT NOT NULL,
      last_used INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, command)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS steal_immunity (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      immune_until INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    )
  `).run();
}

ensureSchema();

const getCooldownRow = db.prepare(`
  SELECT last_used
  FROM command_cooldowns
  WHERE guild_id = ? AND user_id = ? AND command = ?
`);

const upsertCooldown = db.prepare(`
  INSERT INTO command_cooldowns (guild_id, user_id, command, last_used)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id, command) DO UPDATE SET
    last_used = excluded.last_used
`);

const getStealImmunity = db.prepare(`
  SELECT immune_until
  FROM steal_immunity
  WHERE guild_id = ? AND user_id = ?
`);

const upsertStealImmunity = db.prepare(`
  INSERT INTO steal_immunity (guild_id, user_id, immune_until)
  VALUES (?, ?, ?)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET
    immune_until = excluded.immune_until
`);

const deleteExpiredImmunity = db.prepare(`
  DELETE FROM steal_immunity
  WHERE immune_until <= ?
`);

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function formatDuration(ms) {
  ms = Math.max(0, Math.ceil(Number(ms) || 0));
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getCooldownRemaining(guildId, userId, command, cooldownMs) {
  const row = getCooldownRow.get(String(guildId), String(userId), String(command));
  if (!row) return 0;

  const elapsed = Date.now() - Number(row.last_used || 0);
  if (elapsed >= cooldownMs) return 0;

  return cooldownMs - elapsed;
}

function useCooldown(guildId, userId, command, cooldownMs) {
  const remaining = getCooldownRemaining(guildId, userId, command, cooldownMs);
  if (remaining > 0) return remaining;

  upsertCooldown.run(String(guildId), String(userId), String(command), Date.now());
  return 0;
}

function getBoostMultiplier(client, guildId, userId) {
  if (!client?.economy?.getBoostStatus) return 1;

  const boost = client.economy.getBoostStatus(String(guildId), String(userId));
  if (!boost) return 1;

  if (Number(boost.expires_at || 0) <= Date.now()) return 1;
  return Math.max(1, Number(boost.multiplier) || 1);
}

function boostProfit(client, guildId, userId, profit) {
  const multiplier = getBoostMultiplier(client, guildId, userId);
  return Math.max(0, Math.round(Number(profit || 0) * multiplier));
}

function setStealImmunity(guildId, userId, durationMs) {
  const immuneUntil = Date.now() + Math.max(0, Number(durationMs) || 0);
  upsertStealImmunity.run(String(guildId), String(userId), immuneUntil);
  return immuneUntil;
}

function getStealImmunityRemaining(guildId, userId) {
  deleteExpiredImmunity.run(Date.now());

  const row = getStealImmunity.get(String(guildId), String(userId));
  if (!row) return 0;

  const remaining = Number(row.immune_until || 0) - Date.now();
  return remaining > 0 ? remaining : 0;
}

module.exports = {
  db,
  formatNumber,
  formatDuration,
  useCooldown,
  getCooldownRemaining,
  getBoostMultiplier,
  boostProfit,
  setStealImmunity,
  getStealImmunityRemaining,
};