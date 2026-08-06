const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let config = null;
try {
  config = require('../config');
} catch {}

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'shop.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const CUSTOM_ROLE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const CUSTOM_ROLE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

function canManageShop(client, message) {
  if (!message?.guild || !message?.member) return false;
  if (String(message.guild.ownerId) === String(message.author.id)) return true;

  const ownerId = config?.ownerId ? String(config.ownerId) : null;
  if (ownerId && String(message.author.id) === ownerId) return true;

  if (Array.isArray(config?.ownerIds) && config.ownerIds.some(id => String(id) === String(message.author.id))) {
    return true;
  }

  if (String(client?.ownerId || '') === String(message.author.id)) return true;
  if (Array.isArray(client?.ownerIds) && client.ownerIds.some(id => String(id) === String(message.author.id))) {
    return true;
  }

  return false;
}

function parseDurationMs(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  const match = raw.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2];
  const map = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return value * map[unit];
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMinutes = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || !parts.length) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function ensureSchema() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS normal_shop_items (
      guild_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      cooldown_ms INTEGER NOT NULL DEFAULT 0,
      custom_duration_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      PRIMARY KEY (guild_id, item_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS normal_shop_purchases (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      last_bought_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, item_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS normal_shop_inventory (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      PRIMARY KEY (guild_id, user_id, item_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS normal_custom_roles (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      purchased_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      deleted_by_bot INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS ec_shop_items (
      guild_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      cooldown_ms INTEGER NOT NULL DEFAULT 0,
      custom_duration_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      PRIMARY KEY (guild_id, item_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS ec_shop_purchases (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      last_bought_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, item_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS ec_shop_inventory (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      PRIMARY KEY (guild_id, user_id, item_id)
    )
  `).run();
}

ensureSchema();

const nextItemIdStmt = {
  normal: db.prepare(`
    SELECT MAX(CAST(item_id AS INTEGER)) AS max_id
    FROM normal_shop_items
    WHERE guild_id = ?
  `),
  ec: db.prepare(`
    SELECT MAX(CAST(item_id AS INTEGER)) AS max_id
    FROM ec_shop_items
    WHERE guild_id = ?
  `),
};

const listItemsStmt = {
  normal: db.prepare(`
    SELECT item_id, name, price, cooldown_ms, custom_duration_ms
    FROM normal_shop_items
    WHERE guild_id = ?
    ORDER BY CAST(item_id AS INTEGER) ASC
  `),
  ec: db.prepare(`
    SELECT item_id, name, price, cooldown_ms, custom_duration_ms
    FROM ec_shop_items
    WHERE guild_id = ?
    ORDER BY CAST(item_id AS INTEGER) ASC
  `),
};

function padId(n) {
  return String(n).padStart(2, '0');
}

function getNextItemId(shopKey, guildId) {
  const row = nextItemIdStmt[shopKey].get(String(guildId));
  const next = Number(row?.max_id || 0) + 1;
  return padId(next);
}

function listShopItems(shopKey, guildId) {
  return listItemsStmt[shopKey].all(String(guildId));
}

function getItemById(shopKey, guildId, itemId) {
  const table = shopKey === 'ec' ? 'ec_shop_items' : 'normal_shop_items';
  return db.prepare(`
    SELECT *
    FROM ${table}
    WHERE guild_id = ? AND item_id = ?
  `).get(String(guildId), String(itemId).padStart(2, '0'));
}

function setupItem(shopKey, guildId, data) {
  const table = shopKey === 'ec' ? 'ec_shop_items' : 'normal_shop_items';
  const itemId = getNextItemId(shopKey, guildId);

  db.prepare(`
    INSERT INTO ${table} (guild_id, item_id, name, price, cooldown_ms, custom_duration_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(guildId),
    itemId,
    String(data.name),
    Number(data.price),
    Number(data.cooldownMs || 0),
    data.customDurationMs == null ? null : Number(data.customDurationMs)
  );

  return getItemById(shopKey, guildId, itemId);
}

function renumberShop(shopKey, guildId) {
  const table = shopKey === 'ec' ? 'ec_shop_items' : 'normal_shop_items';
  const purchaseTable = shopKey === 'ec' ? 'ec_shop_purchases' : 'normal_shop_purchases';
  const invTable = shopKey === 'ec' ? 'ec_shop_inventory' : 'normal_shop_inventory';

  const rows = db.prepare(`
    SELECT item_id
    FROM ${table}
    WHERE guild_id = ?
    ORDER BY CAST(item_id AS INTEGER) ASC
  `).all(String(guildId));

  const tx = db.transaction(() => {
    rows.forEach((row, index) => {
      const oldId = String(row.item_id).padStart(2, '0');
      const newId = padId(index + 1);

      if (oldId === newId) return;

      db.prepare(`UPDATE ${table} SET item_id = ? WHERE guild_id = ? AND item_id = ?`)
        .run(newId, String(guildId), oldId);

      db.prepare(`UPDATE ${purchaseTable} SET item_id = ? WHERE guild_id = ? AND item_id = ?`)
        .run(newId, String(guildId), oldId);

      db.prepare(`UPDATE ${invTable} SET item_id = ? WHERE guild_id = ? AND item_id = ?`)
        .run(newId, String(guildId), oldId);

      if (shopKey === 'normal') {
        db.prepare(`
          UPDATE normal_custom_roles
          SET item_id = ?
          WHERE guild_id = ? AND item_id = ?
        `).run(newId, String(guildId), oldId);
      }
    });
  });

  tx();
}

function deleteItem(shopKey, guildId, itemId) {
  const table = shopKey === 'ec' ? 'ec_shop_items' : 'normal_shop_items';
  const item = getItemById(shopKey, guildId, itemId);
  if (!item) return null;

  db.prepare(`
    DELETE FROM ${table}
    WHERE guild_id = ? AND item_id = ?
  `).run(String(guildId), String(item.item_id));

  renumberShop(shopKey, guildId);
  return item;
}

function getInventory(shopKey, guildId, userId) {
  const table = shopKey === 'ec' ? 'ec_shop_inventory' : 'normal_shop_inventory';
  return db.prepare(`
    SELECT *
    FROM ${table}
    WHERE guild_id = ? AND user_id = ? AND quantity > 0
    ORDER BY CAST(item_id AS INTEGER) ASC
  `).all(String(guildId), String(userId));
}

function getPurchaseCooldown(shopKey, guildId, userId, itemId) {
  const table = shopKey === 'ec' ? 'ec_shop_purchases' : 'normal_shop_purchases';
  return db.prepare(`
    SELECT last_bought_at
    FROM ${table}
    WHERE guild_id = ? AND user_id = ? AND item_id = ?
  `).get(String(guildId), String(userId), String(itemId).padStart(2, '0'))?.last_bought_at || 0;
}

function setPurchaseCooldown(shopKey, guildId, userId, itemId, timestamp) {
  const table = shopKey === 'ec' ? 'ec_shop_purchases' : 'normal_shop_purchases';
  db.prepare(`
    INSERT INTO ${table} (guild_id, user_id, item_id, last_bought_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET
      last_bought_at = excluded.last_bought_at
  `).run(String(guildId), String(userId), String(itemId).padStart(2, '0'), Number(timestamp));
}

function addInventory(shopKey, guildId, userId, itemId, amount = 1) {
  const table = shopKey === 'ec' ? 'ec_shop_inventory' : 'normal_shop_inventory';
  db.prepare(`
    INSERT INTO ${table} (guild_id, user_id, item_id, quantity, last_updated)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET
      quantity = quantity + excluded.quantity,
      last_updated = excluded.last_updated
  `).run(String(guildId), String(userId), String(itemId).padStart(2, '0'), Number(amount), Date.now());
}

function setCustomRole(guildId, userId, itemId, roleId, expiresAt, purchasedAt = Date.now()) {
  db.prepare(`
    INSERT INTO normal_custom_roles (
      guild_id, user_id, item_id, role_id, purchased_at, expires_at, active, deleted_by_bot
    )
    VALUES (?, ?, ?, ?, ?, ?, 1, 0)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      item_id = excluded.item_id,
      role_id = excluded.role_id,
      purchased_at = excluded.purchased_at,
      expires_at = excluded.expires_at,
      active = 1,
      deleted_by_bot = 0
  `).run(String(guildId), String(userId), String(itemId).padStart(2, '0'), String(roleId), Number(purchasedAt), Number(expiresAt));
}

function getCustomRoleByUser(guildId, userId) {
  return db.prepare(`
    SELECT *
    FROM normal_custom_roles
    WHERE guild_id = ? AND user_id = ? AND active = 1
  `).get(String(guildId), String(userId));
}

function getCustomRoleByRoleId(guildId, roleId) {
  return db.prepare(`
    SELECT *
    FROM normal_custom_roles
    WHERE guild_id = ? AND role_id = ? AND active = 1
  `).get(String(guildId), String(roleId));
}

function deactivateCustomRole(guildId, userId, deletedByBot = 0) {
  db.prepare(`
    UPDATE normal_custom_roles
    SET active = 0, deleted_by_bot = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(Number(deletedByBot) ? 1 : 0, String(guildId), String(userId));
}

async function createCustomRoleForUser(client, guild, user, name = 'Custom Role') {
  return await guild.roles.create({
    name,
    permissions: [],
    hoist: false,
    mentionable: false,
    reason: `Custom role bought by ${user.tag}`,
  });
}

async function buyItem(shopKey, client, guild, user, itemId) {
  const item = getItemById(shopKey, guild.id, itemId);
  if (!item) return { ok: false, reason: 'not_found' };

  const now = Date.now();
  const price = Number(item.price || 0);
  const balance = client.economy.getBalance(guild.id, user.id);

  if (balance < price) return { ok: false, reason: 'no_money' };

  const cooldownMs = Number(item.cooldown_ms || 0);
  const lastBought = getPurchaseCooldown(shopKey, guild.id, user.id, item.item_id);
  if (cooldownMs > 0 && lastBought && now - lastBought < cooldownMs) {
    return {
      ok: false,
      reason: 'cooldown',
      remaining: cooldownMs - (now - lastBought),
    };
  }

  const removed = client.economy.removeCrowns(guild.id, user.id, price, {
    type: `${shopKey}_shop_purchase`,
    reason: `Bought ${item.name}`,
    actorId: user.id,
  });

  if (!removed) return { ok: false, reason: 'no_money' };

  setPurchaseCooldown(shopKey, guild.id, user.id, item.item_id, now);

  if (shopKey === 'normal' && item.custom_duration_ms) {
    const existing = getCustomRoleByUser(guild.id, user.id);
    if (existing) {
      return { ok: false, reason: 'already_has_custom' };
    }

    const role = await createCustomRoleForUser(client, guild, user, 'Custom Role').catch(() => null);
    if (!role) {
      client.economy.addCrowns(guild.id, user.id, price, {
        type: 'refund',
        reason: 'Custom role creation failed',
        actorId: user.id,
      });
      return { ok: false, reason: 'role_create_failed' };
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member) await member.roles.add(role.id).catch(() => {});

    const expiresAt = now + Number(item.custom_duration_ms);
    setCustomRole(guild.id, user.id, item.item_id, role.id, expiresAt, now);
    return { ok: true, purchasedCustomRole: true, role, item };
  }

  addInventory(shopKey, guild.id, user.id, item.item_id, 1);
  return { ok: true, purchasedCustomRole: false, item };
}

async function sweepExpiredCustomRoles(client) {
  const rows = db.prepare(`
    SELECT *
    FROM normal_custom_roles
    WHERE active = 1
  `).all();

  const now = Date.now();

  for (const row of rows) {
    const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
    if (!guild) continue;

    const role = guild.roles.cache.get(row.role_id) || await guild.roles.fetch(row.role_id).catch(() => null);
    const isExpired = now >= Number(row.expires_at || 0);

    if (!role) {
      deactivateCustomRole(row.guild_id, row.user_id, 0);
      continue;
    }

    if (isExpired) {
      await role.delete('Custom role expired').catch(() => {});
      deactivateCustomRole(row.guild_id, row.user_id, 1);
      continue;
    }
  }
}

function init(client) {
  if (client._shopReady) return module.exports;

  client._shopReady = true;
  client.shopDB = db;
  client.shopSystem = module.exports;

  if (!client._shopSweepInterval) {
    client._shopSweepInterval = setInterval(() => {
      sweepExpiredCustomRoles(client).catch(err => {
        console.error('[Shop] sweep failed:', err);
      });
    }, 5 * 60 * 1000);

    client._shopSweepInterval.unref?.();
  }

  return module.exports;
}

module.exports = {
  init,
  money,
  canManageShop,
  parseDurationMs,
  formatDuration,
  getNextItemId,
  listShopItems,
  getItemById,
  setupItem,
  deleteItem,
  getInventory,
  buyItem,
  getCustomRoleByUser,
  getCustomRoleByRoleId,
  deactivateCustomRole,
  createCustomRoleForUser,
  setPurchaseCooldown,
  getPurchaseCooldown,
  CUSTOM_ROLE_DURATION_MS,
  CUSTOM_ROLE_COOLDOWN_MS,
  sweepExpiredCustomRoles,
};