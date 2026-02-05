// commands/info/invitedebug.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'invitedebug',
  description: 'Debug invite tracking system',
  category: 'info',
  usage: 'invitedebug',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    try {
      // Check if tables exist
      const tables = client.automodDB.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name IN ('invite_tracker', 'invite_stats')
      `).all();

      // Get all tracked invites
      const trackedInvites = client.automodDB.prepare(`
        SELECT * FROM invite_tracker WHERE guild_id = ?
      `).all(message.guild.id);

      // Get all invite stats
      const inviteStats = client.automodDB.prepare(`
        SELECT * FROM invite_stats WHERE guild_id = ?
      `).all(message.guild.id);

      // Get current server invites
      let serverInvites = [];
      try {
        const invites = await message.guild.invites.fetch();
        serverInvites = invites.map(inv => ({
          code: inv.code,
          inviter: inv.inviter?.tag || 'Unknown',
          uses: inv.uses
        }));
      } catch (err) {
        serverInvites = ['Error fetching invites: ' + err.message];
      }

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('Invite Tracker Debug')
        .addFields(
          { name: 'Tables Found', value: tables.map(t => t.name).join(', ') || 'None', inline: false },
          { name: 'Tracked Joins', value: trackedInvites.length.toString(), inline: true },
          { name: 'Users with Stats', value: inviteStats.length.toString(), inline: true },
          { name: 'Server Invites', value: serverInvites.length.toString(), inline: true }
        );

      // Show tracked invites
      if (trackedInvites.length > 0) {
        const tracked = trackedInvites.slice(0, 5).map(t => 
          `Inviter: <@${t.inviter_id}> → Invited: <@${t.invited_id}>`
        ).join('\n');
        embed.addFields({ name: 'Recent Tracked Joins (5)', value: tracked, inline: false });
      }

      // Show invite stats
      if (inviteStats.length > 0) {
        const stats = inviteStats.slice(0, 5).map(s => 
          `<@${s.user_id}>: ${s.invite_count} invites`
        ).join('\n');
        embed.addFields({ name: 'Invite Stats (5)', value: stats, inline: false });
      }

      // Show current server invites
      if (Array.isArray(serverInvites) && serverInvites.length > 0) {
        const invList = serverInvites.slice(0, 5).map(inv => 
          `\`${inv.code}\` by ${inv.inviter} (${inv.uses} uses)`
        ).join('\n');
        embed.addFields({ name: 'Current Server Invites (5)', value: invList, inline: false });
      }

      await message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('[InviteDebug] Error:', err);
      await message.reply('Error running debug: ' + err.message);
    }
  }
};
