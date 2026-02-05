// commands/info/inviteleaderboard.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'inviteleaderboard',
  description: 'View the invite leaderboard',
  category: 'info',
  usage: 'inviteleaderboard [page]',
  aliases: ['invitelb', 'invitetop', 'invlb'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    const page = parseInt(args[0]) || 1;
    const perPage = 10;
    const offset = (page - 1) * perPage;

    try {
      // Get total count
      const totalCount = client.automodDB.prepare(`
        SELECT COUNT(*) as count FROM invite_stats
        WHERE guild_id = ? AND invite_count > 0
      `).get(message.guild.id);

      const totalPages = Math.ceil((totalCount?.count || 0) / perPage);

      if (page < 1 || page > totalPages) {
        return message.reply(`Invalid page. Please choose a page between 1 and ${totalPages}.`);
      }

      // Get leaderboard
      const leaderboard = client.automodDB.prepare(`
        SELECT user_id, invite_count 
        FROM invite_stats
        WHERE guild_id = ? AND invite_count > 0
        ORDER BY invite_count DESC
        LIMIT ? OFFSET ?
      `).all(message.guild.id, perPage, offset);

      if (leaderboard.length === 0) {
        return message.reply('No invite statistics found.');
      }

      let description = '';
      for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const rank = offset + i + 1;
        const user = await client.users.fetch(entry.user_id).catch(() => null);
        const username = user ? user.username : entry.user_id;

        description += `**${rank}.** ${username}\n${entry.invite_count} invites\n\n`;
      }

      const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('Invite Leaderboard')
        .setDescription(description.trim())
        .setFooter({ text: `Page ${page} of ${totalPages} • Server: ${message.guild.name}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('[InviteLeaderboard] Error:', err);
      await message.reply('Failed to fetch invite leaderboard.');
    }
  }
};