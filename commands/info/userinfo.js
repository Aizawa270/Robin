const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'userinfo',
  description: 'Shows information about a user.',
  category: 'info',
  usage: '$userinfo [@user|username|userID]',
  aliases: ['ui'],
  async execute(client, message, args) {
    let user;

    if (args[0]) {
      // Try mention first
      user = message.mentions.users.first();

      // Try by ID
      if (!user) {
        user = await client.users.fetch(args[0]).catch(() => null);
      }

      // Try by username (search in guild)
      if (!user && message.guild) {
        const searchTerm = args.join(' ').toLowerCase();
        const member = message.guild.members.cache.find(m => 
          m.user.username.toLowerCase() === searchTerm ||
          m.user.tag.toLowerCase() === searchTerm ||
          m.displayName.toLowerCase() === searchTerm
        );
        if (member) user = member.user;
      }

      // If still not found, return error
      if (!user) {
        return message.reply('User not found. Try mentioning them, using their ID, or their exact username.');
      }
    } else {
      // Default to message author
      user = message.author;
    }

    const member = message.guild?.members.cache.get(user.id);

    const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`;
    const joinedAt = member?.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      : 'Unknown';

    const roles = member
      ? member.roles.cache
          .filter((r) => r.id !== message.guild.id)
          .sort((a, b) => b.position - a.position)
          .map((r) => r.toString())
      : [];

    const embed = new EmbedBuilder()
      .setColor(colors.userinfo)
      .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL({ size: 1024 }) })
      .setThumbnail(user.displayAvatarURL({ size: 1024 }))
      .addFields(
        { name: 'Username', value: `${user.tag}`, inline: true },
        { name: 'User ID', value: user.id, inline: true },
        { name: 'Account Created', value: createdAt, inline: false },
        { name: 'Joined Server', value: joinedAt, inline: false },
        {
          name: `Roles [${roles.length}]`,
          value: roles.length ? roles.join(', ') : 'No roles',
        },
      );

    await message.reply({ embeds: [embed] });
  },
};