const { EmbedBuilder } = require('discord.js');
const { colors, ownerId } = require('../../config');

module.exports = {
  name: 'prefixless',
  description: 'Manage users who can use commands without the prefix.',
  category: 'utility',
  usage: '$prefixless <add|remove|list> [@user or userID]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command can only be used in a server.');
    if (message.author.id !== ownerId) return message.reply('Only the bot owner can manage prefixless users.');

    const sub = args.shift()?.toLowerCase();
    if (!sub || !['add', 'remove', 'list'].includes(sub)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(colors.afk || '#94a3b8')
            .setTitle('Prefixless Command Usage')
            .setDescription(
              '**Usage:**\n`$prefixless add @user`\n`$prefixless remove @user`\n`$prefixless list`\n\n' +
              '**Example:** `$prefixless add @SomeUser`'
            )
        ]
      });
    }

    const db = client.prefixlessDB;

    if (sub === 'list') {
      const rows = db.prepare(`SELECT user_id FROM prefixless`).all();
      if (!rows.length) return message.reply('No users have prefixless enabled.');

      const members = rows.map(r => {
        const m = message.guild.members.cache.get(r.user_id);
        return m ? `${m.user.tag} (${r.user_id})` : `Unknown user (${r.user_id})`;
      }).join('\n');

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(colors.afk || '#94a3b8')
            .setTitle('Prefixless Users')
            .setDescription(members)
        ]
      });
    }

    const target = message.mentions.users.first() || (args[0] && await client.users.fetch(args[0]).catch(() => null));
    if (!target) return message.reply('Please specify a user by mention or ID.');

    if (sub === 'add') {
      db.prepare(`INSERT OR IGNORE INTO prefixless (user_id) VALUES (?)`).run(target.id);
      client.prefixless.add(target.id);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(colors.afk || '#94a3b8')
            .setTitle('Prefixless Added ✅')
            .setDescription(`Successfully added prefixless to **${target.tag}**`)
        ]
      });
    }

    if (sub === 'remove') {
      db.prepare(`DELETE FROM prefixless WHERE user_id = ?`).run(target.id);
      client.prefixless.delete(target.id);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(colors.afk || '#94a3b8')
            .setTitle('Prefixless Removed ⚠️')
            .setDescription(`Successfully removed prefixless from **${target.tag}**`)
        ]
      });
    }
  },
};