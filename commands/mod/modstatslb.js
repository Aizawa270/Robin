const { EmbedBuilder } = require('discord.js');
const { getModLeaderboard } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'modstatslb',
  description: 'View moderation leaderboard for this server.',
  category: 'mod',
  usage: '$modstatslb [page]',
  aliases: ['modlb', 'modleaderboard', 'modstatsleaderboard'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    const page = parseInt(args[0]) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    try {
      // Get total count of moderators with actions
      const totalModerators = client.modstatsDB.prepare(`
        SELECT COUNT(DISTINCT moderator_id) as count 
        FROM modstats 
        WHERE guild_id = ?
      `).get(message.guild.id).count;

      // Get leaderboard for current page
      const leaderboard = client.modstatsDB.prepare(`
        SELECT 
          moderator_id,
          COUNT(*) as total_actions,
          SUM(CASE WHEN action_type = 'warn' THEN 1 ELSE 0 END) as warns,
          SUM(CASE WHEN action_type = 'warnremove' THEN 1 ELSE 0 END) as warnremoves,
          SUM(CASE WHEN action_type = 'ban' THEN 1 ELSE 0 END) as bans,
          SUM(CASE WHEN action_type = 'unban' THEN 1 ELSE 0 END) as unbans,
          SUM(CASE WHEN action_type = 'mute' THEN 1 ELSE 0 END) as mutes,
          SUM(CASE WHEN action_type = 'unmute' THEN 1 ELSE 0 END) as unmutes,
          SUM(CASE WHEN action_type = 'kick' THEN 1 ELSE 0 END) as kicks
        FROM modstats 
        WHERE guild_id = ?
        GROUP BY moderator_id
        ORDER BY total_actions DESC
        LIMIT ? OFFSET ?
      `).all(message.guild.id, limit, offset);

      if (leaderboard.length === 0) {
        return message.reply('No moderation activity recorded yet.');
      }

      // Try to fetch usernames
      let leaderboardText = '';
      let rank = offset + 1;
      
      for (const mod of leaderboard) {
        let username = `Unknown (${mod.moderator_id})`;
        try {
          const user = await client.users.fetch(mod.moderator_id).catch(() => null);
          if (user) username = user.username;
        } catch {}
        
        leaderboardText += `${rank}. **${username}**\n`;
        leaderboardText += `   Total: ${mod.total_actions} | `;
        
        // Show top 3 action types
        const actions = [
          { name: 'Warns', count: mod.warns },
          { name: 'Bans', count: mod.bans },
          { name: 'Kicks', count: mod.kicks },
          { name: 'Mutes', count: mod.mutes },
          { name: 'Unbans', count: mod.unbans },
          { name: 'Warn Removals', count: mod.warnremoves },
          { name: 'Unmutes', count: mod.unmutes }
        ];
        
        // Sort by count and take top 3
        const topActions = actions
          .filter(a => a.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        
        if (topActions.length > 0) {
          leaderboardText += `${topActions.map(a => `${a.name}: ${a.count}`).join(' | ')}\n`;
        } else {
          leaderboardText += '\n';
        }
        
        rank++;
      }

      const totalPages = Math.ceil(totalModerators / limit);
      
      const embed = new EmbedBuilder()
        .setColor('#3b82f6')
        .setTitle(`Moderation Leaderboard`)
        .setDescription(`Server: ${message.guild.name}\nPage: ${page}/${totalPages}\n\n${leaderboardText}`)
        .setFooter({ 
          text: `Total Moderators: ${totalModerators} • Use ${message.prefix || '$'}modstatslb <page> to view more`,
          iconURL: message.guild.iconURL()
        })
        .setTimestamp();

      // Add author's rank if they're not in current page
      if (message.author) {
        const authorRank = client.modstatsDB.prepare(`
          WITH ranked AS (
            SELECT moderator_id, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as rank
            FROM modstats 
            WHERE guild_id = ?
            GROUP BY moderator_id
          )
          SELECT rank FROM ranked WHERE moderator_id = ?
        `).get(message.guild.id, message.author.id);
        
        if (authorRank) {
          const authorPage = Math.ceil(authorRank.rank / limit);
          if (authorPage !== page) {
            embed.addFields({
              name: 'Your Rank',
              value: `You are rank #${authorRank.rank} (page ${authorPage})`,
              inline: false
            });
          }
        }
      }

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Modstatslb command error:', error);
      await message.reply('Failed to fetch leaderboard.');
    }
  },
};