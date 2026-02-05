// commands/info/invites.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'invites',
  description: 'View invite statistics for a user',
  category: 'info',
  usage: 'invites [@user|userID|username]',
  aliases: ['invite', 'inv'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    let targetUser;

    if (args[0]) {
      // Try mention
      targetUser = message.mentions.users.first();

      // Try by ID
      if (!targetUser) {
        targetUser = await client.users.fetch(args[0]).catch(() => null);
      }

      // Try by username
      if (!targetUser) {
        const searchTerm = args.join(' ').toLowerCase();
        const member = message.guild.members.cache.find(m => 
          m.user.username.toLowerCase() === searchTerm ||
          m.user.tag.toLowerCase() === searchTerm ||
          m.displayName.toLowerCase() === searchTerm
        );
        if (member) targetUser = member.user;
      }

      if (!targetUser) {
        return message.reply('User not found.');
      }
    } else {
      targetUser = message.author;
    }

    try {
      // Get user's invite count
      const stats = client.automodDB.prepare(`
        SELECT invite_count FROM invite_stats
        WHERE guild_id = ? AND user_id = ?
      `).get(message.guild.id, targetUser.id);

      const inviteCount = stats?.invite_count || 0;

      // Get rank
      const leaderboard = client.automodDB.prepare(`
        SELECT user_id, invite_count 
        FROM invite_stats
        WHERE guild_id = ?
        ORDER BY invite_count DESC
      `).all(message.guild.id);

      const rankIndex = leaderboard.findIndex(entry => entry.user_id === targetUser.id);
      const rank = rankIndex !== -1 ? rankIndex + 1 : 'N/A';

      const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setAuthor({
          name: `${targetUser.tag}`,
          iconURL: targetUser.displayAvatarURL({ size: 128 })
        })
        .setTitle('Invite Statistics')
        .addFields(
          { name: 'Total Invites', value: `${inviteCount}`, inline: true },
          { name: 'Rank', value: `#${rank}`, inline: true }
        )
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setTimestamp()
        .setFooter({ text: `Server: ${message.guild.name}` });

      await message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('[Invites] Error:', err);
      await message.reply('Failed to fetch invite statistics.');
    }
  }
};