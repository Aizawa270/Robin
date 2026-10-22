const { EmbedBuilder } = require('discord.js');
const economy = require('./economy');

const db = economy.db;
const DEFAULT_COLOR = '#5b0000';

if (!db) {
  throw new Error(
    '[Economy Extras] Could not access the existing economy database.'
  );
}

// ============================================================
// DATABASE TABLES
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS economy_personal_banks (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS economy_reward_cooldowns (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    claim_type TEXT NOT NULL,
    claimed_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, claim_type)
  );
`);

// ============================================================
// PREPARED STATEMENTS
// ============================================================

const ensureWalletUser = db.prepare(`
  INSERT OR IGNORE INTO economy_users (
    guild_id,
    user_id,
    balance
  )
  VALUES (?, ?, 0)
`);

const getWalletStmt = db.prepare(`
  SELECT balance
  FROM economy_users
  WHERE guild_id = ? AND user_id = ?
`);

const decreaseWalletStmt = db.prepare(`
  UPDATE economy_users
  SET balance = balance - ?
  WHERE guild_id = ? AND user_id = ? AND balance >= ?
`);

const increaseWalletStmt = db.prepare(`
  UPDATE economy_users
  SET balance = balance + ?
  WHERE guild_id = ? AND user_id = ?
`);

const ensurePersonalBank = db.prepare(`
  INSERT OR IGNORE INTO economy_personal_banks (
    guild_id,
    user_id,
    balance,
    updated_at
  )
  VALUES (?, ?, 0, ?)
`);

const getPersonalBankStmt = db.prepare(`
  SELECT balance
  FROM economy_personal_banks
  WHERE guild_id = ? AND user_id = ?
`);

const increasePersonalBankStmt = db.prepare(`
  UPDATE economy_personal_banks
  SET balance = balance + ?,
      updated_at = ?
  WHERE guild_id = ? AND user_id = ?
`);

const decreasePersonalBankStmt = db.prepare(`
  UPDATE economy_personal_banks
  SET balance = balance - ?,
      updated_at = ?
  WHERE guild_id = ? AND user_id = ? AND balance >= ?
`);

const getCooldownStmt = db.prepare(`
  SELECT claimed_at
  FROM economy_reward_cooldowns
  WHERE guild_id = ?
    AND user_id = ?
    AND claim_type = ?
`);

const saveCooldownStmt = db.prepare(`
  INSERT INTO economy_reward_cooldowns (
    guild_id,
    user_id,
    claim_type,
    claimed_at
  )
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id, claim_type)
  DO UPDATE SET claimed_at = excluded.claimed_at
`);

const insertTransactionStmt = db.prepare(`
  INSERT INTO economy_transactions (
    guild_id,
    user_id,
    actor_id,
    type,
    amount,
    reason,
    timestamp
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// ============================================================
// INTERNAL HELPERS
// ============================================================

function normalizeId(value) {
  return String(value);
}

function ensureWallet(guildId, userId) {
  ensureWalletUser.run(
    normalizeId(guildId),
    normalizeId(userId)
  );
}

function ensureBank(guildId, userId, now = Date.now()) {
  ensurePersonalBank.run(
    normalizeId(guildId),
    normalizeId(userId),
    Number(now)
  );
}

function getWalletBalance(guildId, userId) {
  ensureWallet(guildId, userId);

  const row = getWalletStmt.get(
    normalizeId(guildId),
    normalizeId(userId)
  );

  return Number(row?.balance || 0);
}

// ============================================================
// PERSONAL BANK
// ============================================================

function getBankBalance(guildId, userId) {
  ensureBank(guildId, userId);

  const row = getPersonalBankStmt.get(
    normalizeId(guildId),
    normalizeId(userId)
  );

  return Number(row?.balance || 0);
}

function depositToBank(guildId, userId, requestedAmount) {
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const now = Date.now();

  const isAll =
    typeof requestedAmount === 'string' &&
    requestedAmount.toLowerCase() === 'all';

  if (
    !isAll &&
    (!Number.isSafeInteger(Number(requestedAmount)) ||
      Number(requestedAmount) <= 0)
  ) {
    return {
      ok: false,
      code: 'invalid_amount',
    };
  }

  return db.transaction(() => {
    ensureWallet(gid, uid);
    ensureBank(gid, uid, now);

    const wallet = getWalletBalance(gid, uid);
    const bank = getBankBalance(gid, uid);

    const amount = isAll
      ? wallet
      : Number(requestedAmount);

    if (amount <= 0) {
      return {
        ok: false,
        code: 'empty_wallet',
      };
    }

    if (wallet < amount) {
      return {
        ok: false,
        code: 'insufficient_wallet',
        wallet,
      };
    }

    const removed = decreaseWalletStmt.run(
      amount,
      gid,
      uid,
      amount
    );

    if (removed.changes !== 1) {
      return {
        ok: false,
        code: 'insufficient_wallet',
      };
    }

    increasePersonalBankStmt.run(
      amount,
      now,
      gid,
      uid
    );

    insertTransactionStmt.run(
      gid,
      uid,
      uid,
      'deposit',
      amount,
      'Deposited into personal bank',
      now
    );

    return {
      ok: true,
      amount,
      wallet: wallet - amount,
      bank: bank + amount,
    };
  })();
}

function withdrawFromBank(guildId, userId, requestedAmount) {
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const now = Date.now();

  const isAll =
    typeof requestedAmount === 'string' &&
    requestedAmount.toLowerCase() === 'all';

  if (
    !isAll &&
    (!Number.isSafeInteger(Number(requestedAmount)) ||
      Number(requestedAmount) <= 0)
  ) {
    return {
      ok: false,
      code: 'invalid_amount',
    };
  }

  return db.transaction(() => {
    ensureWallet(gid, uid);
    ensureBank(gid, uid, now);

    const wallet = getWalletBalance(gid, uid);
    const bank = getBankBalance(gid, uid);

    const amount = isAll
      ? bank
      : Number(requestedAmount);

    if (amount <= 0) {
      return {
        ok: false,
        code: 'empty_bank',
      };
    }

    if (bank < amount) {
      return {
        ok: false,
        code: 'insufficient_bank',
        bank,
      };
    }

    const removed = decreasePersonalBankStmt.run(
      amount,
      now,
      gid,
      uid,
      amount
    );

    if (removed.changes !== 1) {
      return {
        ok: false,
        code: 'insufficient_bank',
      };
    }

    increaseWalletStmt.run(amount, gid, uid);

    insertTransactionStmt.run(
      gid,
      uid,
      uid,
      'withdraw',
      amount,
      'Withdrawn from personal bank',
      now
    );

    return {
      ok: true,
      amount,
      wallet: wallet + amount,
      bank: bank - amount,
    };
  })();
}

// ============================================================
// GIVING CROWNS TO ANOTHER USER
// ============================================================

function transferCash(guildId, senderId, recipientId, amount) {
  const gid = normalizeId(guildId);
  const sender = normalizeId(senderId);
  const recipient = normalizeId(recipientId);

  amount = Number(amount);

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return {
      ok: false,
      code: 'invalid_amount',
    };
  }

  if (sender === recipient) {
    return {
      ok: false,
      code: 'self_transfer',
    };
  }

  return db.transaction(() => {
    const removed = economy.removeCrowns(
      gid,
      sender,
      amount,
      {
        actorId: sender,
        type: 'give',
        reason: `Crowns transferred to user ${recipient}`,
      }
    );

    if (!removed) {
      return {
        ok: false,
        code: 'insufficient_wallet',
        wallet: economy.getBalance(gid, sender),
      };
    }

    const added = economy.addCrowns(
      gid,
      recipient,
      amount,
      {
        actorId: sender,
        type: 'receive',
        reason: `Crowns received from user ${sender}`,
      }
    );

    if (!added) {
      throw new Error(
        'Could not credit the recipient during a Crown transfer.'
      );
    }

    return {
      ok: true,
      amount,
      senderBalance: economy.getBalance(gid, sender),
      recipientBalance: economy.getBalance(gid, recipient),
    };
  })();
}

// ============================================================
// DAILY AND WEEKLY REWARDS
// ============================================================

function claimReward(
  guildId,
  userId,
  claimType,
  amount,
  cooldownMs,
  now = Date.now()
) {
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const type = String(claimType).toLowerCase();

  amount = Number(amount);
  cooldownMs = Number(cooldownMs);
  now = Number(now);

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !Number.isFinite(cooldownMs) ||
    cooldownMs <= 0
  ) {
    return {
      ok: false,
      code: 'invalid_reward',
    };
  }

  return db.transaction(() => {
    const previous = getCooldownStmt.get(
      gid,
      uid,
      type
    );

    const lastClaimedAt = Number(
      previous?.claimed_at || 0
    );

    if (lastClaimedAt > 0) {
      const remainingMs =
        cooldownMs - (now - lastClaimedAt);

      if (remainingMs > 0) {
        return {
          ok: false,
          code: 'cooldown',
          remainingMs,
          nextClaimAt: lastClaimedAt + cooldownMs,
        };
      }
    }

    const added = economy.addCrowns(
      gid,
      uid,
      amount,
      {
        type: `${type}_reward`,
        reason: `${type} reward claim`,
        timestamp: now,
      }
    );

    if (!added) {
      throw new Error(
        `Could not award the ${type} reward.`
      );
    }

    saveCooldownStmt.run(
      gid,
      uid,
      type,
      now
    );

    return {
      ok: true,
      amount,
      claimedAt: now,
      nextClaimAt: now + cooldownMs,
    };
  })();
}

// ============================================================
// AMOUNT PARSING
// ============================================================

function parseAmount(raw, allowAll = false) {
  if (raw === undefined || raw === null) {
    return {
      ok: false,
      code: 'missing_amount',
    };
  }

  const value = String(raw).trim();

  if (
    allowAll &&
    value.toLowerCase() === 'all'
  ) {
    return {
      ok: true,
      all: true,
      amount: 'all',
    };
  }

  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) {
    return {
      ok: false,
      code: 'invalid_amount',
    };
  }

  const amount = Number(value.replace(/,/g, ''));

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return {
      ok: false,
      code: 'invalid_amount',
    };
  }

  return {
    ok: true,
    all: false,
    amount,
  };
}

// ============================================================
// EMBED HELPERS
// ============================================================

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
        embed.setFooter({
          text: data.footer,
        });
      } else {
        embed.setFooter(data.footer);
      }
    }

    return embed;
  }

  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTimestamp();

  if (data.title) {
    embed.setTitle(data.title);
  }

  if (data.description) {
    embed.setDescription(data.description);
  }

  if (data.thumbnail) {
    embed.setThumbnail(data.thumbnail);
  }

  if (data.footer) {
    if (typeof data.footer === 'string') {
      embed.setFooter({
        text: data.footer,
      });
    } else {
      embed.setFooter(data.footer);
    }
  }

  return embed;
}

function formatMoney(client, amount) {
  const formatter =
    client?.economy?.formatCurrency ||
    economy.formatCurrency;

  if (typeof formatter === 'function') {
    return formatter(Number(amount || 0));
  }

  return `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

function formatDuration(ms) {
  ms = Math.max(0, Math.ceil(Number(ms) / 1000) * 1000);

  if (typeof economy.formatDuration === 'function') {
    return economy.formatDuration(ms);
  }

  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);

  if (remainingSeconds || parts.length === 0) {
    parts.push(`${remainingSeconds}s`);
  }

  return parts.join(' ');
}

module.exports = {
  getBankBalance,
  depositToBank,
  withdrawFromBank,
  transferCash,
  claimReward,
  parseAmount,
  buildEmbed,
  formatMoney,
  formatDuration,
};