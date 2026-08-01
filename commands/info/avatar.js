const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

async function resolveAvatarUser(client, message, input) {
  if (!input) return null;

  const raw = String(input).trim();

  // Mention
  const mention = raw.match(/^<@!?(\d{15,20})>$/);
  if (mention) {
    return await client.users.fetch(mention[1]).catch(() => null);
  }

  // ID
  if (/^\d{15,20}$/.test(raw)) {
    return await client.users.fetch(raw).catch(() => null);
  }

  // Username / tag only (NO display name)
  const query = raw.toLowerCase();

  return (
    client.users.cache.find(u =>
      u.username?.toLowerCase() === query ||
      u.tag?.toLowerCase() === query
    ) || null
  );
}

module.exports = {
  name: 'avatar',
  aliases: ['av', 'pfp'],
  description: "Shows a user's avatar.",
  category: 'info',
  usage: '$avatar [@user]',
  async execute(client, message, args) {

    let user = message.author;

    if (args[0]) {
      const resolved = await resolveAvatarUser(client, message, args[0]);

      if (!resolved) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#ef4444')
              .setTitle('Avatar Failed')
              .setDescription('User not found. Use a mention, user ID, or username.')
          ]
        });
      }

      user = resolved;
    }

    let avatarUrl;

    // Server profile avatar
    if (message.guild) {
      const member = await message.guild.members.fetch(user.id).catch(() => null);

      if (member) {
        avatarUrl = member.displayAvatarURL({
          size: 2048,
          extension: 'png',
          forceStatic: false
        });
      }
    }

    // Normal Discord avatar fallback
    if (!avatarUrl) {
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
        text: `Requested by ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL()
      })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};