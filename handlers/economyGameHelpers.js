const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COOLDOWN_MS = 30 * 60 * 1000;

// ============================================================
// DATABASE
// ============================================================

const DATA_DIR = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'economy_games.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.prepare(`
  CREATE TABLE IF NOT EXISTS economy_game_cooldowns (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    command TEXT NOT NULL,
    last_used INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, command)
  )
`).run();

const getCooldownStmt = db.prepare(`
  SELECT last_used
  FROM economy_game_cooldowns
  WHERE guild_id = ? AND user_id = ? AND command = ?
`);

const setCooldownStmt = db.prepare(`
  INSERT INTO economy_game_cooldowns (
    guild_id,
    user_id,
    command,
    last_used
  )
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id, command)
  DO UPDATE SET last_used = excluded.last_used
`);

const clearCooldownStmt = db.prepare(`
  DELETE FROM economy_game_cooldowns
  WHERE guild_id = ? AND user_id = ? AND command = ?
`);

// ============================================================
// COOLDOWNS
// ============================================================

function checkCooldown(guildId, userId, command, now = Date.now()) {
  const gid = String(guildId);
  const uid = String(userId);
  const commandName = String(command).toLowerCase();

  const existing = getCooldownStmt.get(gid, uid, commandName);

  if (!existing) {
    return {
      allowed: true,
      remaining: 0,
    };
  }

  const elapsed = now - Number(existing.last_used);
  const remaining = COOLDOWN_MS - elapsed;

  if (remaining > 0) {
    return {
      allowed: false,
      remaining,
    };
  }

  return {
    allowed: true,
    remaining: 0,
  };
}

function startCooldown(guildId, userId, command, now = Date.now()) {
  setCooldownStmt.run(
    String(guildId),
    String(userId),
    String(command).toLowerCase(),
    now
  );
}

function clearCooldown(guildId, userId, command) {
  clearCooldownStmt.run(
    String(guildId),
    String(userId),
    String(command).toLowerCase()
  );
}

// Backwards-compatible helper for any existing commands that use it.
function claimCooldown(guildId, userId, command, now = Date.now()) {
  const result = checkCooldown(guildId, userId, command, now);

  if (!result.allowed) {
    return result;
  }

  startCooldown(guildId, userId, command, now);

  return {
    allowed: true,
    remaining: 0,
  };
}

// ============================================================
// FORMATTING
// ============================================================

function formatDuration(ms) {
  const totalSeconds = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);

  if (seconds || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

function formatCurrency(client, amount) {
  const value = Number(amount) || 0;

  if (typeof client?.economy?.formatCurrency === 'function') {
    return client.economy.formatCurrency(value);
  }

  return `${value.toLocaleString('en-US')} Crowns`;
}

// ============================================================
// EMBEDS
// ============================================================

function buildEmbed(message, data = {}) {
  let embed = null;

  if (typeof message.createEmbed === 'function') {
    try {
      embed = message.createEmbed({
        title: data.title,
        description: data.description,
        thumbnail: data.thumbnail,
        footer: data.footer,
      });
    } catch (error) {
      console.error('[Economy Games] Could not create custom embed:', error);
    }
  }

  if (!embed || typeof embed.setDescription !== 'function') {
    embed = new EmbedBuilder()
      .setColor('#5b0000')
      .setTimestamp();

    if (data.title) {
      embed.setTitle(data.title);
    }

    if (data.description) {
      embed.setDescription(data.description);
    }
  }

  if (data.thumbnail) {
    embed.setThumbnail(data.thumbnail);
  }

  if (data.footer) {
    embed.setFooter(
      typeof data.footer === 'string'
        ? { text: data.footer }
        : data.footer
    );
  }

  return embed;
}

// ============================================================
// CROWN REWARDS
// ============================================================

function awardCrowns(client, guildId, userId, amount, source = {}) {
  if (
    !client?.economy ||
    typeof client.economy.addCrowns !== 'function'
  ) {
    throw new Error('The economy system is not initialized.');
  }

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`Invalid Crown reward: ${amount}`);
  }

  // A zero-Crown result is a valid outcome.
  if (amount === 0) {
    return null;
  }

  let meta;

  if (typeof source === 'string') {
    const commandName = source.toLowerCase();

    meta = {
      type: commandName,
      reason: `${commandName} reward`,
    };
  } else {
    meta = {
      ...(source || {}),
    };
  }

  // Keep the balance change and transaction record atomic when possible.
  if (typeof client.economy.db?.transaction === 'function') {
    const result = client.economy.db.transaction(() => {
      return client.economy.addCrowns(
        String(guildId),
        String(userId),
        amount,
        meta
      );
    })();

    if (!result) {
      throw new Error('The economy handler did not apply the reward.');
    }

    return result;
  }

  const result = client.economy.addCrowns(
    String(guildId),
    String(userId),
    amount,
    meta
  );

  if (!result) {
    throw new Error('The economy handler did not apply the reward.');
  }

  return result;
}

// ============================================================
// RANDOM RESULTS
// ============================================================

function randomIntBetween(min, max) {
  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max) ||
    min > max
  ) {
    throw new Error(`Invalid random range: ${min} to ${max}`);
  }

  // crypto.randomInt uses an exclusive upper bound.
  return crypto.randomInt(min, max + 1);
}

function randomLine(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return 'Well, that was embarrassing.';
  }

  return lines[randomIntBetween(0, lines.length - 1)];
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  COOLDOWN_MS,

  checkCooldown,
  startCooldown,
  clearCooldown,
  claimCooldown,

  formatDuration,
  formatCurrency,
  buildEmbed,

  awardCrowns,

  randomIntBetween,
  randomLine,
};