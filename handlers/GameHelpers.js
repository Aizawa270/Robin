const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const COOLDOWN_MS = 30 * 60 * 1000;

// Save cooldowns separately from the main economy database.
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'economy_games.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.prepare(`
  CREATE TABLE IF NOT EXISTS economy_game_cooldowns (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    command TEXT NOT NULL,
    last_used INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, command)
  )
`).run();

const getCooldown = db.prepare(`
  SELECT last_used
  FROM economy_game_cooldowns
  WHERE guild_id = ? AND user_id = ? AND command = ?
`);

const setCooldown = db.prepare(`
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

function claimCooldown(guildId, userId, command, now = Date.now()) {
  guildId = String(guildId);
  userId = String(userId);

  const existing = getCooldown.get(guildId, userId, command);

  if (existing) {
    const elapsed = now - existing.last_used;
    const remaining = COOLDOWN_MS - elapsed;

    if (remaining > 0) {
      return {
        allowed: false,
        remaining,
      };
    }
  }

  setCooldown.run(guildId, userId, command, now);

  return {
    allowed: true,
    remaining: 0,
  };
}

function formatDuration(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatCurrency(client, amount) {
  if (typeof client?.economy?.formatCurrency === 'function') {
    return client.economy.formatCurrency(amount);
  }

  return `${Number(amount).toLocaleString('en-US')} Crowns`;
}

function buildEmbed(message, data = {}) {
  if (typeof message.createEmbed === 'function') {
    const embed = message.createEmbed({
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      footer: data.footer,
    });

    if (data.thumbnail) {
      embed.setThumbnail(data.thumbnail);
    }

    if (data.footer) {
      if (typeof data.footer === 'string') {
        embed.setFooter({ text: data.footer });
      } else {
        embed.setFooter(data.footer);
      }
    }

    return embed;
  }

  const embed = new EmbedBuilder()
    .setColor('#5b0000')
    .setTimestamp();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);

  if (data.footer) {
    if (typeof data.footer === 'string') {
      embed.setFooter({ text: data.footer });
    } else {
      embed.setFooter(data.footer);
    }
  }

  return embed;
}

function awardCrowns(client, guildId, userId, amount, source) {
  if (!client?.economy || typeof client.economy.addCrowns !== 'function') {
    throw new Error('The economy system is not initialized.');
  }

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`Invalid Crown reward: ${amount}`);
  }

  // Zero-Crown outcomes are valid, but there is nothing to add.
  if (amount === 0) return;

  client.economy.addCrowns(
    String(guildId),
    String(userId),
    amount,
    source
  );
}

function randomIntBetween(min, max) {
  const crypto = require('crypto');

  // crypto.randomInt uses an exclusive upper bound.
  return crypto.randomInt(min, max + 1);
}

function randomLine(lines) {
  return lines[randomIntBetween(0, lines.length - 1)];
}

module.exports = {
  COOLDOWN_MS,
  claimCooldown,
  formatDuration,
  formatCurrency,
  buildEmbed,
  awardCrowns,
  randomIntBetween,
  randomLine,
};