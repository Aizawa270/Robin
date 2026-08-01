const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

async function resolveAvatarUser(client, message, input) {
  if (!input) return null;

  const query = String(input).trim();

  // Mention
  const mention = query.match(/^<@!?(\d{15,20})>$/);
  if (mention) {
    return await client.users.fetch(mention[1]).catch(() => null);
  }

  // ID only
  if (/^\d{15,20}$/.test(query)) {
    return await client.users.fetch(query).catch(() => null);
  }

  // Username only (NO display names)
  const lowered = query.toLowerCase();

  const user = client.users.cache.find(u =>
    u.username?.toLowerCase() === lowered ||
    u.tag?.toLowerCase() === lowered
  );

  if (user) return user;

  // Fetch guild members and check ONLY username
  if (message.guild) {
    const members = await message.guild.members.fetch({
      query,
      limit: 10
    }).catch(() => null);

    if (members?.size) {
      const exact = members.find(m =>
        m.user.username?.toLowerCase() === lowered ||
        m.user.tag?.toLowerCase() === lowered
      );

      if (exact) return exact.user;
    }
  }

  return null;
}

module.exports = {
  name: 'avatar',
  aliases: ['av', 'pfp'],
  description: "Shows a user's avatar.",
  category: 'info',
  usage: '$avatar [@user|username|ID]',

  async execute(client, message, args) {
    let user = null;

    if (args[0]) {
      user = await resolveAvatarUser(client, message, args[0]);
    }

    if (!user) {
      user = message.author;
    }

    let avatarUrl;

    // Server profile avatar
    const member = message.guild?.members.cache.get(user.id);

    if (member) {
      avatarUrl = member.displayAvatarURL({
        size: 2048,
        extension: 'png',
        forceStatic: false
      });
    } else {
      avatarUrl = user.displayAvatarURL({
        size: 2048,
        extension: 'png',
        forceStatic: false
      });
    }

    const embed = new EmbedBuilder()
      .setColor(colors.avatar || '#5865F2')
      .setTitle('User Avatar')
      .setDescription(`${user}`)
      .setImage(avatarUrl)
      .setFooter({
        text: `Requested by ${message.author.tag}`
      })
      .setTimestamp();

    return message.reply({
      embeds: [embed]
    });
  },
};