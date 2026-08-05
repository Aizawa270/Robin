const { EmbedBuilder } = require('discord.js');

function makeEmbed(message, options = {}) {
  if (typeof message.createEmbed === 'function') {
    const embed = message.createEmbed(options);
    if (options.fields) embed.addFields(options.fields);
    return embed;
  }

  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.fields) embed.addFields(options.fields);
  if (options.footer) embed.setFooter({ text: options.footer });
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  return embed;
}

function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(Number(n) || 0);
}

function formatDate(ts) {
  if (!ts) return 'Never';
  return `<t:${Math.floor(ts / 1000)}:D>`;
}

function formatRelative(ts) {
  if (!ts) return 'Never';
  return `<t:${Math.floor(ts / 1000)}:R>`;
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
          makeEmbed(message, {
            title: 'Message Tracker Unavailable',
            description: 'The message tracker is not initialized.',
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
    const guildStats = client.messageTracker.getGuildStats(guildId);
    const rank = client.messageTracker.getRank(guildId, target.id, 'total');

    const daysTracked = stats.first_seen_at
      ? Math.max(1, Math.ceil((Date.now() - stats.first_seen_at) / 86400000))
      : 1;

    const averagePerDay = stats.total > 0
      ? (stats.total / daysTracked).toFixed(1)
      : '0.0';

    const activityShare = guildStats.total > 0
      ? ((stats.total / guildStats.total) * 100).toFixed(1)
      : '0.0';

    const displayName = message.guild.members.cache.get(target.id)?.displayName || target.username;

    const embed = makeEmbed(message, {
      title: `${displayName} Message Stats`,
      description: `Message tracking for this server.`,
      fields: [
        {
          name: 'Messages',
          value: [
            `Today: ${formatNumber(stats.daily)}`,
            `Week: ${formatNumber(stats.weekly)}`,
            `Month: ${formatNumber(stats.monthly)}`,
            `Total: ${formatNumber(stats.total)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Standing',
          value: [
            `Rank: ${rank ? `#${rank}` : 'N/A'}`,
            `Activity: ${activityShare}%`,
            `Tracked Users: ${formatNumber(guildStats.tracked_users)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Activity',
          value: [
            `Average/Day: ${averagePerDay}`,
            `Current Streak: ${formatNumber(stats.current_streak)}`,
            `Longest Streak: ${formatNumber(stats.longest_streak)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Records',
          value: [
            `Peak Day: ${formatNumber(stats.peak_daily)}`,
            `Peak Week: ${formatNumber(stats.peak_weekly)}`,
            `Peak Month: ${formatNumber(stats.peak_monthly)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Dates',
          value: [
            `First Seen: ${formatDate(stats.first_seen_at)}`,
            `Last Message: ${formatRelative(stats.last_message_at)}`,
          ].join('\n'),
          inline: true,
        },
      ],
      footer: client.user?.username ? client.user.username : 'Message tracker',
      thumbnail: target.displayAvatarURL({ size: 256 }),
    });

    return message.reply({ embeds: [embed] });
  },
};