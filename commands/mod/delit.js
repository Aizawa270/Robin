const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let config = null;
try {
config = require('../../config');
} catch {}

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'delaccess.sqlite');

function ensureDb(client) {
if (client.delAccessDB) return client.delAccessDB;

if (!fs.existsSync(DATA_DIR)) {
fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.prepare("CREATE TABLE IF NOT EXISTS del_access ( guild_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (guild_id, user_id) )").run();

client.delAccessDB = db;
return db;
}

function makeEmbed(color, title, description) {
const embed = new EmbedBuilder().setColor(color).setTimestamp();
if (title) embed.setTitle(title);
if (description) embed.setDescription(description);
return embed;
}

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

function isServerOwner(message) {
return !!message.guild?.ownerId && String(message.author.id) === String(message.guild.ownerId);
}

function canManageDelAccess(client, message) {
return isBotOwner(client, message.author.id) || isServerOwner(message);
}

function hasDelAccess(client, guildId, userId) {
const db = ensureDb(client);
const row = db.prepare(
'SELECT 1 FROM del_access WHERE guild_id = ? AND user_id = ?'
).get(String(guildId), String(userId));

return !!row;
}

function canUseDelIt(client, message) {
return canManageDelAccess(client, message) || hasDelAccess(client, message.guild.id, message.author.id);
}

async function resolveTargetUser(client, message, input) {
if (!input) return null;

if (typeof message.resolveUser === 'function') {
const resolved = await message.resolveUser(input).catch(() => null);
if (resolved) return resolved;
}

const raw = String(input).trim();
if (!raw) return null;

const mention = raw.match(/^<@!?(\d{15,20})>$/);
if (mention) {
const id = mention[1];
const cached = client.users.cache.get(id);
if (cached) return cached;
return await client.users.fetch(id).catch(() => null);
}

const idOnly = raw.replace(/[<@!>]/g, '');
if (/^\d{15,20}$/.test(idOnly)) {
const cached = client.users.cache.get(idOnly);
if (cached) return cached;
return await client.users.fetch(idOnly).catch(() => null);
}

const lowered = raw.toLowerCase();

const cachedUser = client.users.cache.find(u =>
u?.username?.toLowerCase() === lowered ||
u?.tag?.toLowerCase() === lowered
);
if (cachedUser) return cachedUser;

return null;
}

function usageEmbed(prefix) {
return makeEmbed(
'#f59e0b',
'Delit Usage',
[
"**Delete a replied message:**",
"\"${prefix}delit` (reply to a message)", ``, "Manage delete access:", "`${prefix}delit access add @user|userID|username`", "`${prefix}delit access remove @user|userID|username`", "`${prefix}delit access list``,
].join('\n')
);
}

module.exports = {
name: 'delit',
aliases: ['del'],
description: 'Deletes the replied message and manages delete access.',
category: 'mod',
usage: '$delit | $delit access <add|remove|list> [@user|userID|username]',

async execute(client, message, args) {
if (!message.guild) return;

const db = ensureDb(client);
const prefix = client.getPrefix?.(message.guild.id) || '$';

const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
if (!botMember?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
  return message.reply({
    embeds: [
      makeEmbed(
        '#ef4444',
        'Delit Failed',
        'I need **Manage Messages** permission.'
      )
    ]
  });
}

const sub = (args[0] || '').toLowerCase();

if (sub === 'access') {
  if (!canManageDelAccess(client, message)) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#ef4444',
          'Access Denied',
          'Only the bot owner or server owner can manage delete access.'
        )
      ]
    });
  }

  const action = (args[1] || '').toLowerCase();

  if (!['add', 'remove', 'list'].includes(action)) {
    return message.reply({
      embeds: [usageEmbed(prefix)]
    });
  }

  if (action === 'list') {
    const rows = db.prepare(
      'SELECT user_id FROM del_access WHERE guild_id = ? ORDER BY user_id ASC'
    ).all(message.guild.id);

    if (!rows.length) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#3b82f6',
            'Delete Access List',
            'No users have delete access in this server.'
          )
        ]
      });
    }

    const users = await Promise.all(rows.map(async row => {
      try {
        const user = await client.users.fetch(row.user_id);
        return user ? `<@${user.id}>` : null;
      } catch {
        return null;
      }
    }));

    const clean = users.filter(Boolean).join('\n') || 'No valid users found.';

    return message.reply({
      embeds: [
        makeEmbed(
          '#3b82f6',
          'Delete Access List',
          clean
        )
      ]
    });
  }

  const target = await resolveTargetUser(client, message, args[2]);
  if (!target) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Delit Access Failed',
          'Provide a valid user mention, ID, or exact username.'
        )
      ]
    });
  }

  if (target.bot) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Delit Access Failed',
          'Bots do not need delete access.'
        )
      ]
    });
  }

  if (action === 'add') {
    db.prepare(
      'INSERT OR IGNORE INTO del_access (guild_id, user_id) VALUES (?, ?)'
    ).run(message.guild.id, target.id);

    return message.reply({
      embeds: [
        makeEmbed(
          '#22c55e',
          'Access Added',
          `**${target.tag}** can now use \`${prefix}delit\` in this server.`
        )
      ]
    });
  }

  db.prepare(
    'DELETE FROM del_access WHERE guild_id = ? AND user_id = ?'
  ).run(message.guild.id, target.id);

  return message.reply({
    embeds: [
      makeEmbed(
        '#ef4444',
        'Access Removed',
        `**${target.tag}** can no longer use \`${prefix}delit\` in this server.`
      )
    ]
  });
}

if (!canUseDelIt(client, message)) {
  return message.reply({
    embeds: [
      makeEmbed(
        '#ef4444',
        'Delit Failed',
        'You do not have permission to use this command.'
      )
    ]
  });
}

if (!message.reference?.messageId) {
  return message.reply({
    embeds: [usageEmbed(prefix)]
  });
}

try {
  const targetMsg = await message.channel.messages.fetch(message.reference.messageId);
  await targetMsg.delete().catch(() => {});
  await message.delete().catch(() => {});
} catch (err) {
  console.error('[DelIt] Error:', err);
  return message.reply({
    embeds: [
      makeEmbed(
        '#ef4444',
        'Delit Failed',
        'Failed to delete the replied message.'
      )
    ]
  });
}

}
};