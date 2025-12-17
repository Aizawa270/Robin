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
              '**Usage:**\n' +
              '`$prefixless add @user`\n' +
              '`$prefixless remove @user`\n' +
              '`$prefixless list`\n\n' +
              '**Example:**\n' +
              '`$prefixless add @SomeUser`'
            )
        ]
      });
    }

    if (sub === 'list') {
      const ids = Array.from(client.prefixless);
      if (!ids.length) return message.reply('No users have prefixless enabled.');

      const members = ids.map(id => {
        const m = message.guild.members.cache.get(id);
        return m ? `${m.user.tag} (${id})` : `Unknown user (${id})`;
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

    // add/remove
    const target = message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null));

    if (!target) return message.reply('Specify a user by mention or ID.');

    if (sub === 'add') {
      client.prefixless.add(target.id);
      client.savePrefixless();
      return message.reply(`Enabled prefixless for **${target.tag}** (${target.id}).`);
    }

    if (sub === 'remove') {
      client.prefixless.delete(target.id);
      client.savePrefixless();
      return message.reply(`Disabled prefixless for **${target.tag}** (${target.id}).`);
    }
  }
};