const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');
const { resolveUser: universalResolveUser } = require('../../handlers/universalHelper');

module.exports = {
  name: 'userinfo',
  description: 'Shows information about a user.',
  category: 'info',
  usage: '$userinfo [@user|username|userID]',
  aliases: ['ui'],

  async execute(client, message, args) {
    const query = args.join(' ').trim();
    let user = null;

    if (query) {
      if (typeof message.resolveUser === 'function') {
        user = await message.resolveUser(query).catch(() => null);
      }

      if (!user && typeof universalResolveUser === 'function') {
        user = await universalResolveUser(client, message, query).catch(() => null);
      }

      if (!user) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ef4444')
              .setTitle('User Not Found')
              .setDescription(
                'Could not find that user.\n\nTry using a mention, user ID, username, global name, or tag.'
              )
              .setTimestamp()
          ]
        });
      }
    } else {
      user = message.author;
    }

    const member = message.guild
      ? await message.guild.members
          .fetch(user.id)
          .catch(() => message.guild.members.cache.get(user.id))
      : null;

    const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`;
    const joinedAt = member?.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      : 'Unknown';

    const roles = member
      ? member.roles.cache
          .filter(r => r.id !== message.guild.id)
          .sort((a, b) => b.position - a.position)
          .map(r => r.toString())
      : [];

    const embed = new EmbedBuilder()
      .setColor(colors.userinfo || '#FF69B4')
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 1024 })
      })
      .setThumbnail(user.displayAvatarURL({ size: 1024 }))
      .addFields(
        {
          name: 'Username',
          value: user.username,
          inline: true
        },
        {
          name: 'Display Name',
          value: member?.displayName || 'Unknown',
          inline: true
        },
        {
          name: 'User ID',
          value: user.id,
          inline: true
        },
        {
          name: 'Account Created',
          value: createdAt,
          inline: false
        },
        {
          name: 'Joined Server',
          value: joinedAt,
          inline: false
        },
        {
          name: `Roles [${roles.length}]`,
          value: roles.length ? roles.join(', ') : 'No roles'
        }
      )
      .setTimestamp();

    return message.reply({
      embeds: [embed]
    });
  }
};