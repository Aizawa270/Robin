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
    u?.globalName?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  return null;
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
      return message.reply('Only the bot owner can manage prefixless users.');
    }

    const sub = args.shift()?.toLowerCase();
    const db = client.prefixlessDB;

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
        ]
      });
    }

    if (sub === 'list') {
      const rows = db.prepare('SELECT user_id FROM prefixless').all();
      if (!rows.length) return message.reply('No prefixless users.');

      const list = await Promise.all(rows.map(async r => {
        try {
          const user = await client.users.fetch(r.user_id);
          return user ? `<@${user.id}>` : null;
        } catch {
          return null;
        }
      }));

      const cleanList = list.filter(Boolean).join('\n') || 'No valid users found.';

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#3b82f6')
            .setTitle('Prefixless Users')
            .setDescription(cleanList)
        ]
      });
    }

    const target = await resolveTargetUser(client, message, args[0]);
    if (!target) return message.reply('Provide a user mention or ID.');

    if (sub === 'add') {
      db.prepare('INSERT OR IGNORE INTO prefixless (user_id) VALUES (?)').run(target.id);
      if (client.prefixless instanceof Set) client.prefixless.add(target.id);
      return message.reply(`✅ **${target.tag}** is now prefixless.`);
    }

    if (sub === 'remove') {
      db.prepare('DELETE FROM prefixless WHERE user_id = ?').run(target.id);
      if (client.prefixless instanceof Set) client.prefixless.delete(target.id);
      return message.reply(`⚠️ **${target.tag}** is no longer prefixless.`);
    }
  },
};