const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { resolveUser: universalResolveUser } = require('../../handlers/universalHelper');

let config = null;
try {
  config = require('../../config');
} catch {}

function getBotOwnerIds(client) {
  const ids = new Set();

  if (config?.ownerId) ids.add(String(config.ownerId));
  if (client?.ownerId) ids.add(String(client.ownerId));
  if (client?.ownerIds && Array.isArray(client.ownerIds)) {
    for (const id of client.ownerIds) ids.add(String(id));
  }
  if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));

  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

function ensureStaffAddDB(client) {
  if (client.staffaddDB) return client.staffaddDB;

  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, 'staffadd.sqlite'));
  db.pragma('journal_mode = WAL');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS staffadd_settings (
      guild_id TEXT PRIMARY KEY,
      roles TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS staffadd_access (
      guild_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, target_type, target_id)
    )
  `).run();

  client.staffaddDB = db;
  return db;
}

function canManageStaff(client, member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  if (isBotOwner(client, member.id)) return true;
  return false;
}

function canUseStaffAdd(client, member) {
  if (!member) return false;
  if (canManageStaff(client, member)) return true;

  const db = ensureStaffAddDB(client);

  const userEntry = db.prepare(
    'SELECT 1 FROM staffadd_access WHERE guild_id = ? AND target_type = ? AND target_id = ?'
  ).get(member.guild.id, 'user', member.id);

  if (userEntry) return true;

  const roleEntries = db.prepare(
    'SELECT target_id FROM staffadd_access WHERE guild_id = ? AND target_type = ?'
  ).all(member.guild.id, 'role');

  for (const entry of roleEntries) {
    if (member.roles.cache.has(entry.target_id)) return true;
  }

  return false;
}

function resolveRole(guild, input) {
  if (!input) return null;

  const raw = String(input).trim();
  const cleaned = raw.replace(/[<@&>]/g, '');

  const byId = guild.roles.cache.get(cleaned);
  if (byId) return byId;

  const lowered = cleaned.toLowerCase();
  const byName = guild.roles.cache.find(r => r.name.toLowerCase() === lowered);
  return byName || null;
}

async function resolveTargetUser(message, raw) {
  if (!raw) return null;

  if (typeof message.resolveUser === 'function') {
    const resolved = await message.resolveUser(raw).catch(() => null);
    if (resolved) return resolved;
  }

  const query = String(raw).trim();
  if (!query) return null;

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = message.client.users.cache.get(id);
    if (cached) return cached;
    return await message.client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = message.client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered ||
    u?.tag?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    await message.guild.members.fetch().catch(() => {});

    const member = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered ||
      m?.user?.globalName?.toLowerCase() === lowered ||
      m?.user?.tag?.toLowerCase() === lowered
    );

    if (member?.user) return member.user;
  }

  return null;
}

async function resolveAccessTarget(message, raw) {
  if (!raw) return null;

  const query = String(raw).trim();
  if (!query) return null;

  const cleaned = query.replace(/[<@!&>]/g, '');
  const isNumeric = /^\d{15,20}$/.test(cleaned);

  if (query.startsWith('<@&')) {
    const role = message.guild.roles.cache.get(cleaned);
    if (role) return { type: 'role', id: role.id, label: `<@&${role.id}>` };
    return null;
  }

  if (query.startsWith('<@')) {
    const user = await resolveTargetUser(message, query);
    if (user) return { type: 'user', id: user.id, label: `<@${user.id}>` };
    return null;
  }

  if (isNumeric) {
    const role = message.guild.roles.cache.get(cleaned);
    if (role) return { type: 'role', id: role.id, label: `<@&${role.id}>` };

    const user = await resolveTargetUser(message, cleaned);
    if (user) return { type: 'user', id: user.id, label: `<@${user.id}>` };

    return null;
  }

  const role = resolveRole(message.guild, query);
  if (role) return { type: 'role', id: role.id, label: `<@&${role.id}>` };

  const user = await resolveTargetUser(message, query);
  if (user) return { type: 'user', id: user.id, label: `<@${user.id}>` };

  return null;
}

module.exports = {
  name: 'staffadd',
  aliases: ['staff'],
  description: 'Configure and assign staff starter roles.',
  category: 'mod',
  usage: 'staffadd [setup <@role...>] [remove all] [access add/remove/list] [@user]',
  async execute(client, message, args) {
    if (!message.guild) return;

    const db = ensureStaffAddDB(client);
    const prefix = client.getPrefix?.(message.guild.id) || '$';

    if (!args[0]) {
      const row = db.prepare(
        'SELECT roles FROM staffadd_settings WHERE guild_id = ?'
      ).get(message.guild.id);

      const accessCount = db.prepare(
        'SELECT COUNT(*) AS count FROM staffadd_access WHERE guild_id = ?'
      ).get(message.guild.id)?.count || 0;

      if (!row) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#f59e0b')
              .setTitle('StaffAdd')
              .setDescription('No staff starter roles have been configured.')
              .addFields(
                { name: 'Setup', value: `\`${prefix}staffadd setup @role @role ...\``, inline: false },
                { name: 'Access', value: `\`${prefix}staffadd access add @user/@role\``, inline: false },
                { name: 'Access Count', value: `\`${accessCount}\``, inline: true }
              )
              .setTimestamp()
          ]
        });
      }

      let roleIds = [];
      try {
        roleIds = JSON.parse(row.roles || '[]');
      } catch {
        roleIds = [];
      }

      const mentions = roleIds.length
        ? roleIds.map(id => `<@&${id}>`).join('\n')
        : 'None';

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#7c3aed')
            .setTitle('Staff Starter Roles')
            .setDescription(mentions)
            .addFields({ name: 'Access Count', value: `\`${accessCount}\