const { EmbedBuilder } = require('discord.js');
const { getModStats, getTotalModerators } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'modstats',
  description: 'View your moderation statistics.',
  category: 'mod',
  usage: '$modstats [@user|userID]',
  aliases: ['moderatorstats', 'modstat', 'mystats'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    let targetUser;

    if (args.length > 0) {
      const canViewOthers = message.member.permissions.has('ModerateMembers') || 
                           message.member.permissions.has('Administrator');

      if (!canViewOthers) {
        return message.reply('You need Moderate Members permission to view other moderators stats.');
      }

      const targetArg = args[0];
      targetUser = message.mentions.users.first() || 
                   (await client.users.fetch(targetArg).catch(() => null));

      if (!targetUser) return message.reply('User not found.');
    } else {
      targetUser = message.author;
    }

    const guildId = message.guild.id;
    const moderatorId = targetUser.id;

    try {
      const stats = getModStats(client, guildId, moderatorId);

      if (!stats) {
        return message.reply('Failed to fetch moderation statistics.');
      }

      // Get rank
      const allModerators = client.modstatsDB.prepare(`
        SELECT moderator_id, COUNT(*) as total 
        FROM modstats 
        WHERE guild_id = ? 
        GROUP BY moderator_id 
        ORDER BY total DESC
      `).all(guildId);

      const rankIndex = allModerators.findIndex(entry => entry.moderator_id === moderatorId);
      const rank = rankIndex !== -1 ? rankIndex + 1 : 'N/A';
      const totalModerators = allModerators.length;

      // Build fields vertically (not inline)
      const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle(`Moderation Statistics`)
        .setDescription(`**${targetUser.tag}**\nUser ID: ${moderatorId}`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'Total Actions', value: `${stats.total}`, inline: false },
          { name: 'Rank', value: `#${rank} of ${totalModerators}`, inline: false },
          { name: 'Warns', value: `${stats.warns}`, inline: true },
          { name: 'Warn Removals', value: `${stats.warnremoves}`, inline: true },
          { name: 'Bans', value: `${stats.bans}`, inline: true },
          { name: 'Unbans', value: `${stats.unbans}`, inline: true },
          { name: 'Kicks', value: `${stats.kicks}`, inline: true },
          { name: 'Mutes', value: `${stats.mutes}`, inline: true },
          { name: 'Unmutes', value: `${stats.unmutes}`, inline: true }
        )
        .setTimestamp();

      // Add recent actions if available
      const recentActions = client.modstatsDB.prepare(`
        SELECT action_type, target_id, reason, timestamp 
        FROM modstats 
        WHERE guild_id = ? AND moderator_id = ?
        ORDER BY timestamp DESC 
        LIMIT 5
      `).all(guildId, moderatorId);

      if (recentActions.length > 0) {
        let recentText = '';
        for (const action of recentActions) {
          const date = new Date(action.timestamp);
          const timeAgo = `<t:${Math.floor(date.getTime() / 1000)}:R>`;
          recentText += `**${action.action_type.toUpperCase()}** ${timeAgo}\n`;
        }
        embed.addFields({
          name: 'Recent Actions',
          value: recentText || 'No recent actions',
          inline: false
        });
      }

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Modstats command error:', error);
      await message.reply('Failed to fetch moderation statistics.');
    }
  },
};