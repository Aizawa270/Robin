const { EmbedBuilder } = require('discord.js');
const { colors, ownerId } = require('../../config');

module.exports = {
  name: 'prefixless',
  description: 'Manage users who can use commands without the prefix.',
  category: 'utility',
  usage: '$prefixless <add|remove|list> [@user|id]',
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

    // ===== LIST =====
    if (sub === 'list') {
      const rows = db.prepare('SELECT user_id FROM prefixless').all();
      if (!rows.length) return message.reply('No prefixless users.');

      const list = rows.map(r => {
        const u = message.client.users.cache.get(r.user_id);
        return u ? `${u.tag}` : `Unknown (${r.user_id})`;
      }).join('\n');

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(colors.afk || '#94a3b8')
            .setTitle('Prefixless Users')
            .setDescription(list)
        ]
      });
    }

    // Resolve target
    const target =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null));

    if (!target) return message.reply('Provide a user mention or ID.');

    // ===== ADD =====
    if (sub === 'add') {
      db.prepare('INSERT OR IGNORE INTO prefixless (user_id) VALUES (?)').run(target.id);
      client.prefixless.add(target.id);

      return message.reply(`✅ **${target.tag}** is now prefixless.`);
    }

    // ===== REMOVE =====
    if (sub === 'remove') {
      db.prepare('DELETE FROM prefixless WHERE user_id = ?').run(target.id);
      client.prefixless.delete(target.id);

      return message.reply(`⚠️ **${target.tag}** is no longer prefixless.`);
    }
  },
};