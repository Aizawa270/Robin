const { EmbedBuilder } = require('discord.js');
const { colors, ownerId } = require('../../config');
const fs = require('fs');
const path = require('path');

const PREFIXLESS_FILE = path.join(__dirname, '..', '..', 'prefixless.json');

module.exports = {
  name: 'prefixless',
  description: 'Manage users who can use commands without the prefix.',
  category: 'utility',
  usage: '$prefixless <add|remove|list> [@user or userID]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command can only be used in a server.');
    if (message.author.id !== ownerId) return message.reply('Only the bot owner can manage prefixless users.');
    if (!client.prefixless) client.prefixless = new Set();

    const sub = args.shift()?.toLowerCase();
    if (!sub || !['add', 'remove', 'list'].includes(sub)) {
      const embed = new EmbedBuilder()
        .setColor(colors.afk || '#94a3b8')
        .setTitle('Prefixless Command Usage')
        .setDescription(
          '**Usage:**\n' +
          '`$prefixless add @user`\n' +
          '`$prefixless remove @user`\n' +
          '`$prefixless list`\n\n' +
          '**Example:**\n' +
          '`$prefixless add @SomeUser`'
        );
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'list') {
      const ids = Array.from(client.prefixless);
      if (!ids.length) return message.reply('No users have prefixless enabled.');

      const members = ids.map(id => {
        const m = message.guild.members.cache.get(id);
        return m ? `${m.user.tag} (${id})` : `Unknown user (${id})`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(colors.afk || '#94a3b8')
        .setTitle('Prefixless Users')
        .setDescription(members);

      return message.reply({ embeds: [embed] });
    }

    // add/remove commands require a user
    const target = message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null));

    if (!target) return message.reply('Please specify a user by mention or ID.');

    // function to save prefixless.json
    const savePrefixlessFile = () => {
      try {
        fs.writeFileSync(PREFIXLESS_FILE, JSON.stringify([...client.prefixless], null, 2));
      } catch (err) {
        console.error('Failed to save prefixless.json:', err);
      }
    };

    if (sub === 'add') {
      client.prefixless.add(target.id);
      savePrefixlessFile();

      const embed = new EmbedBuilder()
        .setColor(colors.afk || '#94a3b8')
        .setTitle('Prefixless Added ✅')
        .setDescription(`Successfully added prefixless to **${target.tag}** (@${target.username})`);
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      client.prefixless.delete(target.id);
      savePrefixlessFile();

      const embed = new EmbedBuilder()
        .setColor(colors.afk || '#94a3b8')
        .setTitle('Prefixless Removed ⚠️')
        .setDescription(`Successfully removed prefixless from **${target.tag}** (@${target.username})`);
      return message.reply({ embeds: [embed] });
    }
  },
};