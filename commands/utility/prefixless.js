const { EmbedBuilder } = require('discord.js');
const { colors, ownerId } = require('../../config');
const { resolveUser: universalResolveUser } = require('../../handlers/universalHelper');

async function resolveTargetUser(client, message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(input).catch(() => null);
  }

  if (typeof universalResolveUser === 'function') {
    return await universalResolveUser(client, message, input).catch(() => null);
  }

  const raw = String(input).trim();
  if (!raw) return null;

  const id = raw.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = raw.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered ||
    u?.tag?.toLowerCase() === lowered
  );

  return cachedUser || null;
}

function ensureGuildCache(client, guildId) {
  if (!client.prefixlessByGuild) client.prefixlessByGuild = new Map();

  const key = String(guildId);
  if (!client.prefixlessByGuild.has(key)) {
    client.prefixlessByGuild.set(key, new Set());
  }

  return client.prefixlessByGuild.get(key);
}

function hydrateGuildPrefixless(client, guildId) {
  const rows = client.prefixlessDB
    .prepare('SELECT user_id FROM prefixless_guild WHERE guild_id = ?')
    .all(String(guildId));

  const set = new Set(rows.map(r => String(r.user_id)));
  client.prefixlessByGuild.set(String(guildId), set);
  return set;
}

module.exports = {
  name: 'prefixless',
  description: 'Manage users who can use commands without the prefix.',
  category: 'utility',
  usage: '$prefixless <add|remove|list> [@user|id]',
  aliases: [],
  hidden: true,

  async execute(client, message, args) {
    if (!message.guild) return;

    if (message.author.id !== ownerId) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setTitle('Prefixless Denied')
            .setDescription('Only the bot owner can manage prefixless users.')
            .setTimestamp()
        ]
      });
    }

    const db = client.prefixlessDB;
    const guildId = message.guild.id;
    const sub = args.shift()?.toLowerCase();

    if (!['add', 'remove', 'list'].includes(sub)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(colors.afk || '#94a3b8')
            .setTitle('Prefixless Usage')
            .setDescription(
              '`$prefixless add @user`\n' +
              '`$prefixless remove @user`\n' +
              '`$prefixless list`'
            )
            .setTimestamp()
        ]
      });
    }

    if (sub === 'list') {
      const rows = db.prepare(
        'SELECT user_id FROM prefixless_guild WHERE guild_id = ?'
      ).all(guildId);

      if (!rows.length) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#3b82f6')
              .setTitle('Prefixless Users')
              .setDescription('No prefixless users in this server.')
              .setTimestamp()
          ]
        });
      }

      const users = await Promise.all(rows.map(async r => {
        try {
          const user = await client.users.fetch(r.user_id);
          return user ? `<@${user.id}>` : null;
        } catch {
          return null;
        }
      }));

      const cleanList = users.filter(Boolean).join('\n') || 'No valid users found.';

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#3b82f6')
            .setTitle('Prefixless Users')
            .setDescription(cleanList)
            .setFooter({ text: `Server: ${message.guild.name}` })
            .setTimestamp()
        ]
      });
    }

    const target = await resolveTargetUser(client, message, args[0]);
    if (!target) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle('Prefixless Failed')
            .setDescription('Provide a valid user mention, ID, or exact username.')
            .setTimestamp()
        ]
      });
    }

    const cache = ensureGuildCache(client, guildId);

    if (sub === 'add') {
      db.prepare(
        'INSERT OR IGNORE INTO prefixless_guild (guild_id, user_id) VALUES (?, ?)'
      ).run(guildId, target.id);

      cache.add(target.id);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#22c55e')
            .setTitle('Prefixless Added')
            .setDescription(`**${target.tag}** can now use commands without the prefix in this server.`)
            .setTimestamp()
        ]
      });
    }

    if (sub === 'remove') {
      db.prepare(
        'DELETE FROM prefixless_guild WHERE guild_id = ? AND user_id = ?'
      ).run(guildId, target.id);

      cache.delete(target.id);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setTitle('Prefixless Removed')
            .setDescription(`**${target.tag}** is no longer prefixless in this server.`)
            .setTimestamp()
        ]
      });
    }
  }
};