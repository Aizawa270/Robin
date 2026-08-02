const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getModStats } = require('../../handlers/modstatsHelper');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

async function resolveTargetUserStrict(client, message, input) {
  if (!input) return null;

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
    u?.username?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    const cachedMember = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered
    );
    if (cachedMember?.user) return cachedMember.user;

    const fetched = await message.guild.members.fetch().catch(() => null);
    if (fetched?.size) {
      const exact = fetched.find(m =>
        m?.user?.username?.toLowerCase() === lowered
      );
      if (exact?.user) return exact.user;
    }
  }

  return null;
}

module.exports = {
  name: 'modstats',
  description: 'View your moderation statistics.',
  category: 'mod',
  usage: '$modstats [@user|userID|username]',
  aliases: ['moderatorstats', 'modstat', 'mystats'],
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Modstats Failed', 'This command only works in servers.')]
      });
    }

    let targetUser;

    if (args.length > 0) {
      const canViewOthers =
        message.member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
        message.member.permissions.has(PermissionFlagsBits.Administrator);

      if (!canViewOthers) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Modstats Failed', 'You need **Moderate Members** permission to view other moderators’ stats.')]
        });
      }

      const targetQuery = args.join(' ').trim();
      targetUser = await resolveTargetUserStrict(client, message, targetQuery);

      if (!targetUser) {
        return message.reply({
          embeds: [makeEmbed('#f59e0b', 'User Not Found', 'Could not find that user. Try a mention, ID, or exact username.')]
        });
      }
    } else {
      targetUser = message.author;
    }

    const guildId = message.guild.id;
    const moderatorId = targetUser.id;

    try {
      if (!client.automodDB) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Modstats Error', 'Modstats database is not available. Please restart the bot.')]
        });
      }

      const stats = getModStats(client, guildId, moderatorId);

      if (!stats) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Modstats Failed', 'Failed to fetch moderation statistics.')]
        });
      }

      const allModerators = client.automodDB.prepare(`
        SELECT moderator_id, COUNT(*) as total
        FROM modstats
        WHERE guild_id = ? AND action_type != 'unmute'
        GROUP BY moderator_id
        ORDER BY total DESC
      `).all(guildId);

      const rankIndex = allModerators.findIndex(entry => entry.moderator_id === moderatorId);
      const rank = rankIndex !== -1 ? rankIndex + 1 : 'N/A';
      const totalModerators = allModerators.length;

      const embed = new EmbedBuilder()
        .setTitle('Moderation Statistics')
        .setDescription(`**${targetUser.tag}**\nUser ID: ${moderatorId}`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .setColor('#22c55e')
        .setTimestamp()
        .addFields(
          { name: 'Total Actions', value: `${stats.total}`, inline: false },
          { name: 'Rank', value: `#${rank} of ${totalModerators}`, inline: false },
          { name: 'Warns', value: `${stats.warns}`, inline: true },
          { name: 'Warn Removals', value: `${stats.warnremoves}`, inline: true },
          { name: 'Bans', value: `${stats.bans}`, inline: true },
          { name: 'Unbans', value: `${stats.unbans}`, inline: true },
          { name: 'Kicks', value: `${stats.kicks}`, inline: true },
          { name: 'Mutes', value: `${stats.mutes}`, inline: true }
        );

      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Modstats command error:', error);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Modstats Failed', 'Failed to fetch moderation statistics.')]
      });
    }
  },
};