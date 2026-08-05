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

function scopeToColumn(scope) {
  const normalized = String(scope || 'total').toLowerCase();
  if (['daily', 'weekly', 'monthly', 'total'].includes(normalized)) return normalized;
  return 'total';
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
  name: 'msglb',
  description: 'Show the message leaderboard.',
  category: 'utility',
  usage: '$msglb [total|daily|weekly|monthly] [page]',
  aliases: ['msglb', 'leaderboardmsg', 'msgleaderboard'],

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

    let scope = 'total';
    let page = 1;

    if (args[0]) {
      const maybeScope = String(args[0]).toLowerCase();
      if (['total', 'daily', 'weekly', 'monthly'].includes(maybeScope)) {
        scope = maybeScope;
        page = parseInt(args[1], 10) || 1;
      } else {
        page = parseInt(args[0], 10) || 1;
      }
    }

    const limit = 10;
    const offset = (page - 1) * limit;
    const rows = client.messageTracker.getLeaderboard(message.guild.id, scope, limit, offset);

    if (!rows.length) {
      return message.reply({
        embeds: [
          makeEmbed(message, {
            title: 'Message Leaderboard',
            description: 'No tracked messages found in this server yet.',
          }),
        ],
      });
    }

    const lines = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const member = message.guild.members.cache.get(row.user_id) || await message.guild.members.fetch(row.user_id).catch(() => null);
      const user = member?.user || await client.users.fetch(row.user_id).catch(() => null);
      const name = member?.displayName || user?.username || row.user_id;
      const value = formatNumber(row[scope]);

      const line = `${offset + i + 1}. ${name} - ${value}`;
      lines.push(row.user_id === message.author.id ? `**${line}**` : line);
    }

    const userRank = client.messageTracker.getRank(message.guild.id, message.author.id, scope);

    const embed = makeEmbed(message, {
      title: `Message Leaderboard`,
      description: `Scope: ${scope}`,
      fields: [
        {
          name: `Page ${page}`,
          value: lines.join('\n'),
          inline: false,
        },
        {
          name: 'Your Position',
          value: userRank ? `#${userRank}` : 'N/A',
          inline: true,
        },
      ],
      footer: client.user?.username ? client.user.username : 'Message tracker',
    });

    return message.reply({ embeds: [embed] });
  },
};