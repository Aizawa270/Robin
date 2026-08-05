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

module.exports = {
  name: 'msgstats',
  description: 'Show server message tracking stats.',
  category: 'utility',
  usage: '$msgstats',
  aliases: ['servermsgs', 'servermsgstats'],

  async execute(client, message) {
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

    const guildStats = client.messageTracker.getGuildStats(message.guild.id);
    const top = client.messageTracker.getLeaderboard(message.guild.id, 'total', 1, 0)[0] || null;

    let topName = 'N/A';
    if (top) {
      const member = message.guild.members.cache.get(top.user_id) || await message.guild.members.fetch(top.user_id).catch(() => null);
      const user = member?.user || await client.users.fetch(top.user_id).catch(() => null);
      topName = member?.displayName || user?.username || top.user_id;
    }

    const averagePerUser = guildStats.tracked_users > 0
      ? (guildStats.total / guildStats.tracked_users).toFixed(1)
      : '0.0';

    const embed = makeEmbed(message, {
      title: 'Server Message Stats',
      description: 'Current tracking summary for this server.',
      fields: [
        { name: 'Tracked Users', value: formatNumber(guildStats.tracked_users), inline: true },
        { name: 'Total Messages', value: formatNumber(guildStats.total), inline: true },
        { name: 'Today', value: formatNumber(guildStats.daily), inline: true },
        { name: 'Week', value: formatNumber(guildStats.weekly), inline: true },
        { name: 'Month', value: formatNumber(guildStats.monthly), inline: true },
        { name: 'Average Per User', value: averagePerUser, inline: true },
        { name: 'Top User', value: topName, inline: true },
      ],
      footer: client.user?.username ? client.user.username : 'Message tracker',
    });

    return message.reply({ embeds: [embed] });
  },
};