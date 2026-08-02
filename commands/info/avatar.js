const { EmbedBuilder } = require('discord.js');

let colors = {};
try {
  colors = require('../../config').colors || {};
} catch {}

async function resolveAvatarUser(client, message, input) {
  if (!input) return null;

  const query = String(input).trim();
  if (!query) return null;

  const mention = query.match(/^<@!?(\d{15,20})>$/);
  if (mention) {
    return await client.users.fetch(mention[1]).catch(() => null);
  }

  if (/^\d{15,20}$/.test(query)) {
    return await client.users.fetch(query).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.tag?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    const member = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered ||
      m?.user?.tag?.toLowerCase() === lowered
    );

    if (member?.user) return member.user;
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

    const member = message.guild
      ? (message.guild.members.cache.get(user.id) || await message.guild.members.fetch(user.id).catch(() => null))
      : null;

    const avatarUrl = (member || user).displayAvatarURL({
      size: 2048,
      extension: 'png',
      forceStatic: false
    });

    const embed = new EmbedBuilder()
      .setColor(colors.avatar || '#5865F2')
      .setTitle('User Avatar')
      .setDescription(`${user}`)
      .setImage(avatarUrl)
      .setFooter({ text: `Requested by ${message.author.tag}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};