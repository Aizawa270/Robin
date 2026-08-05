const { EmbedBuilder } = require('discord.js');

function formatTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function footerText(client) {
  return `${client.user?.username || 'Bot'} | Today at ${formatTime()}`;
}

function buildEmbed(message, data = {}) {
  if (typeof message.createEmbed === 'function') {
    const embed = message.createEmbed({
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      footer: data.footer,
    });

    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.footer) {
      if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
      else embed.setFooter(data.footer);
    }

    return embed;
  }

  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) {
    if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
    else embed.setFooter(data.footer);
  }
  return embed;
}

async function resolveTargetUser(client, message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(input).catch(() => null);
  }

  const query = String(input).trim();
  if (!query) return null;

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered ||
    u?.tag?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    await message.guild.members.fetch().catch(() => {});
    const member = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered ||
      m?.displayName?.toLowerCase() === lowered
    );
    if (member?.user) return member.user;
  }

  return null;
}

module.exports = {
  name: 'messages',
  description: 'Show message tracking stats for a user.',
  category: 'utility',
  usage: '$messages [@user|id|username]',
  aliases: ['msg', 'mystats'],

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.messageTracker) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Message Tracker Unavailable',
            description: 'The message tracker is not initialized.',
            footer: footerText(client),
          }),
        ],
      });
    }

    const target =
      message.mentions.users.first() ||
      (args[0] ? await resolveTargetUser(client, message, args[0]) : null) ||
      message.author;

    const guildId = message.guild.id;
    const stats = client.messageTracker.getUserStats(guildId, target.id);

    const displayName =
      message.guild.members.cache.get(target.id)?.displayName ||
      target.username;

    const embed = buildEmbed(message, {
      title: `${displayName}'s Messages`,
      description:
        `Today: ${stats.daily || 0}\n` +
        `This Week: ${stats.weekly || 0}\n` +
        `This Month: ${stats.monthly || 0}\n` +
        `Total: ${stats.total || 0}`,
      thumbnail: target.displayAvatarURL({ size: 256 }),
      footer: footerText(client),
    });

    return message.reply({ embeds: [embed] });
  },
};