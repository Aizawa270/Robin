// commands/utility/checklogs.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'checklogs',
  description: 'Check if moderation logs are being saved',
  category: 'utility',
  async execute(client, message, args) {
    try {
      if (!client.automodDB) {
        return message.reply('❌ No database connection!');
      }

      // Get all recent logs
      const recentLogs = client.automodDB.prepare(`
        SELECT * FROM modstats 
        ORDER BY timestamp DESC 
        LIMIT 10
      `).all();

      // Get count by action type
      const statsByType = client.automodDB.prepare(`
        SELECT action_type, COUNT(*) as count 
        FROM modstats 
        GROUP BY action_type 
        ORDER BY count DESC
      `).all();

      const embed = new EmbedBuilder()
        .setTitle('📊 Moderation Logs Status')
        .setColor('#3b82f6')
        .setTimestamp();

      if (recentLogs.length > 0) {
        embed.setDescription(`**Total logs:** ${recentLogs.length} recent entries\n`);
        
        let recentText = '';
        recentLogs.slice(0, 5).forEach(log => {
          const date = new Date(log.timestamp);
          recentText += `**${log.action_type.toUpperCase()}** <t:${Math.floor(date.getTime() / 1000)}:R>\n`;
          recentText += `Mod: ${log.moderator_id.substring(0, 8)} → Target: ${log.target_id.substring(0, 8)}\n`;
          recentText += `Reason: ${log.reason?.substring(0, 50) || 'None'}...\n\n`;
        });
        embed.addFields({ name: 'Recent Activity', value: recentText, inline: false });

        let statsText = '';
        statsByType.forEach(stat => {
          statsText += `**${stat.action_type}**: ${stat.count}\n`;
        });
        embed.addFields({ name: 'Stats by Type', value: statsText, inline: true });
        
        // Check if this user has logs
        const userLogs = client.automodDB.prepare(`
          SELECT COUNT(*) as count 
          FROM modstats 
          WHERE moderator_id = ?
        `).get(message.author.id);
        
        embed.addFields({ 
          name: 'Your Stats', 
          value: `You have ${userLogs.count} logged actions`, 
          inline: true 
        });
        
      } else {
        embed.setDescription('❌ No moderation logs found in database!\n\n**Possible issues:**\n1. Moderation commands not calling logModAction()\n2. Database not saving properly\n3. No moderation actions performed yet');
      }

      // Test database write
      try {
        const testId = `test_${Date.now()}`;
        client.automodDB.prepare(
          'INSERT INTO modstats (guild_id, moderator_id, target_id, action_type, reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('test_guild', 'test_mod', 'test_target', 'test', 'Database test', Date.now());
        
        client.automodDB.prepare('DELETE FROM modstats WHERE action_type = ?').run('test');
        
        embed.addFields({ 
          name: 'Database Test', 
          value: '✅ Read/Write operations working', 
          inline: true 
        });
      } catch (testError) {
        embed.addFields({ 
          name: 'Database Test', 
          value: '❌ Write failed', 
          inline: true 
        });
      }

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Checklogs error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  },
};