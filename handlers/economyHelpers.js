const { EmbedBuilder } = require('discord.js');

let config = null;
try {
  config = require('../config');
} catch {}

function getBotOwnerIds(client) {
  const ids = new Set();

  if (config?.ownerId) ids.add(String(config.ownerId));
  if (Array.isArray(config?.ownerIds)) {
    for (const id of config.ownerIds) ids.add(String(id));
  }

  if (client?.ownerId) ids.add(String(client.ownerId));
  if (Array.isArray(client?.ownerIds)) {
    for (const id of client.ownerIds) ids.add(String(id));
  }

  if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));

  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

function canManageEconomy(client, message) {
  if (!message?.guild || !message?.member) return false;
  if (String(message.guild.ownerId) === String(message.author.id)) return true;
  if (isBotOwner(client, message.author.id)) return true;
  return false;
}

async function resolveTargetUser(client, message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    const resolved = await message.resolveUser(input).catch(() => null);
    if (resolved) return resolved;
  }

  const query = String(input).trim();
  if (!query) return null;

  const mention = query.match(/^<@!?(\d{15,20})>$/);
  if (mention) {
    const id = mention[1];
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(u => {
    if (!u) return false;
    const username = u.username?.toLowerCase?.() || '';
    const globalName = u.globalName?.toLowerCase?.() || '';
    const tag = u.tag?.toLowerCase?.() || '';
    return username === lowered || globalName === lowered || tag === lowered;
  });
  if (cachedUser) return cachedUser;

  if (message.guild) {
    await message.guild.members.fetch().catch(() => {});
    const member = message.guild.members.cache.find(m => {
      if (!m?.user) return false;
      const username = m.user.username?.toLowerCase?.() || '';
      const globalName = m.user.globalName?.toLowerCase?.() || '';
      const displayName = m.displayName?.toLowerCase?.() || '';
      const tag = m.user.tag?.toLowerCase?.() || '';
      return (
        username === lowered ||
        globalName === lowered ||
        displayName === lowered ||
        tag === lowered
      );
    });

    if (member?.user) return member.user;
  }

  return null;
}

module.exports = {
  getBotOwnerIds,
  isBotOwner,
  canManageEconomy,
  resolveTargetUser,
};