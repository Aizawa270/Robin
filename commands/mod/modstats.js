const { EmbedBuilder } = require('discord.js');
const { getModStats } = require('../../handlers/modstatsHelper');

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
      // Check if user has permission to view others' stats
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
      // No args, show own stats
      targetUser = message.author;
    }

    const guildId = message.guild.id;
    const moderatorId = targetUser.id;

    try {
      const stats = getModStats(client, guildId, moderatorId);
      
      if (!stats) {
        return message.reply('Failed to fetch moderation statistics.');
      }

      // Get recent actions for context
      const recentActions = client.modstatsDB.prepare(`
        SELECT action_type, target_id, reason, duration, timestamp 
        FROM modstats 
        WHERE guild_id = ? AND moderator_id = ?
        ORDER BY timestamp DESC 
        LIMIT 5
      `).all(guildId, moderatorId);

      const embed = new EmbedBuilder()
        .setColor('#8b5cf6')
        .setTitle(`Moderation Statistics`)
        .setDescription(`Statistics for **${targetUser.tag}**`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'Total Actions', value: `${stats.total}`, inline: true },
          { name: 'Warns', value: `${stats.warns}`, inline: true },
          { name: 'Warn Removals', value: `${stats.warnremoves}`, inline: true },
          { name: 'Bans', value: `${stats.bans}`, inline: true },
          { name: 'Unbans', value: `${stats.unbans}`, inline: true },
          { name: 'Kicks', value: `${stats.kicks}`, inline: true },
          { name: 'Mutes', value: `${stats.mutes}`, inline: true },
          { name: 'Unmutes', value: `${stats.unmutes}`, inline: true },
          { name: 'Rank', value: '...', inline: true }
        )
        .setFooter({ text: `Moderator ID: ${moderatorId}` })
        .setTimestamp();

      // Add recent actions if available
      if (recentActions.length > 0) {
        let recentText = '';
        
        for (const action of recentActions) {
          const date = new Date(action.timestamp);
          const timeAgo = `<t:${Math.floor(date.getTime() / 1000)}:R>`;
          
          // Try to get target username
          let targetName = action.target_id;
          try {
            const targetUser = await client.users.fetch(action.target_id).catch(() => null);
            if (targetUser) targetName = targetUser.username;
          } catch {}
          
          recentText += `${action.action_type.toUpperCase()} ${targetName} ${timeAgo}\n`;
          if (action.reason && action.reason !== 'No reason provided') {
            recentText += `   - ${action.reason.substring(0, 50)}${action.reason.length > 50 ? '...' : ''}\n`;
          }
        }
        
        embed.addFields({
          name: 'Recent Actions (Last 5)',
          value: recentText || 'No recent actions',
          inline: false
        });
      }

      // Calculate rank
      const leaderboard = client.modstatsDB.prepare(`
        SELECT moderator_id, COUNT(*) as total 
        FROM modstats 
        WHERE guild_id = ? 
        GROUP BY moderator_id 
        ORDER BY total DESC
      `).all(guildId);
      
      const rankIndex = leaderboard.findIndex(entry => entry.moderator_id === moderatorId);
      if (rankIndex !== -1) {
        const rank = rankIndex + 1;
        const totalModerators = leaderboard.length;
        embed.fields[8].value = `#${rank}/${totalModerators}`;
      } else {
        embed.fields[8].value = 'Not ranked';
      }

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Modstats command error:', error);
      await message.reply('Failed to fetch moderation statistics.');
    }
  },
};