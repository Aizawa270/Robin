const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getModLeaderboard, getTotalModerators } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'modstatslb',
  description: 'View moderation leaderboard for this server.',
  category: 'mod',
  usage: '$modstatslb [page]',
  aliases: ['modlb', 'modleaderboard', 'modstatsleaderboard'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    let page = parseInt(args[0]) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const guildId = message.guild.id;

    try {
      const totalModerators = getTotalModerators(client, guildId);
      if (totalModerators === 0) {
        return message.reply('No moderation activity recorded yet.');
      }

      const totalPages = Math.ceil(totalModerators / limit);
      if (page < 1) page = 1;
      if (page > totalPages) page = totalPages;

      // Use updated function with offset
      const leaderboard = getModLeaderboard(client, guildId, limit, offset);

      // Build leaderboard text with vertical layout - REMOVE UNMUTES
      let leaderboardText = '';
      let rank = offset + 1;

      for (const mod of leaderboard) {
        let username = `User ${mod.moderator_id.substring(0, 6)}...`;
        try {
          const user = await client.users.fetch(mod.moderator_id).catch(() => null);
          if (user) username = user.username;
        } catch {}

        leaderboardText += `**${rank}. ${username}**\n`;
        leaderboardText += `Total Actions: ${mod.total_actions}\n`;
        leaderboardText += `Warns: ${mod.warns} | Bans: ${mod.bans} | Kicks: ${mod.kicks}\n`;
        leaderboardText += `Mutes: ${mod.mutes} | Unbans: ${mod.unbans} | Warn Removals: ${mod.warnremoves}\n`;
        // REMOVED: leaderboardText += `Unmutes: ${mod.unmutes} | `;
        leaderboardText += `\n`;

        rank++;
      }

      // Create buttons for pagination
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('modlb_prev')
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
          new ButtonBuilder()
            .setCustomId('modlb_next')
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
        );

      // ✅ USE message.createEmbed()
      const embed = message.createEmbed({
        title: `Moderation Leaderboard`,
        description: `**Server:** ${message.guild.name}\n**Page:** ${page}/${totalPages}\n\n${leaderboardText}`,
        footer: { 
          text: `Total Moderators: ${totalModerators}`,
          iconURL: message.guild.iconURL()
        }
      });

      // Add author's rank if not on current page
      const db = client.modstatsDB || client.automodDB;
      if (message.author && db) {
        const authorRank = db.prepare(`
          WITH ranked AS (
            SELECT moderator_id, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) as rank
            FROM modstats 
            WHERE guild_id = ?
            GROUP BY moderator_id
          )
          SELECT rank FROM ranked WHERE moderator_id = ?
        `).get(guildId, message.author.id);

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

      const msg = await message.reply({ 
        embeds: [embed], 
        components: totalPages > 1 ? [row] : [] 
      });

      // Button collector for pagination
      if (totalPages > 1) {
        const filter = i => i.customId === 'modlb_prev' || i.customId === 'modlb_next';
        const collector = msg.createMessageComponentCollector({ 
          filter, 
          time: 60000 
        });

        collector.on('collect', async i => {
          if (i.user.id !== message.author.id) {
            return i.reply({ 
              content: 'You cannot control this leaderboard.', 
              ephemeral: true 
            });
          }

          await i.deferUpdate();

          if (i.customId === 'modlb_prev' && page > 1) {
            page--;
          } else if (i.customId === 'modlb_next' && page < totalPages) {
            page++;
          }

          // Get new page data
          const newOffset = (page - 1) * limit;
          const newLeaderboard = getModLeaderboard(client, guildId, limit, newOffset);

          // Rebuild leaderboard text
          let newText = '';
          let newRank = newOffset + 1;

          for (const mod of newLeaderboard) {
            let username = `User ${mod.moderator_id.substring(0, 6)}...`;
            try {
              const user = await client.users.fetch(mod.moderator_id).catch(() => null);
              if (user) username = user.username;
            } catch {}

            newText += `**${newRank}. ${username}**\n`;
            newText += `Total Actions: ${mod.total_actions}\n`;
            newText += `Warns: ${mod.warns} | Bans: ${mod.bans} | Kicks: ${mod.kicks}\n`;
            newText += `Mutes: ${mod.mutes} | Unbans: ${mod.unbans} | Warn Removals: ${mod.warnremoves}\n\n`;
            newRank++;
          }

          // Update buttons
          const newRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('modlb_prev')
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
              new ButtonBuilder()
                .setCustomId('modlb_next')
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages)
            );

          const newEmbed = EmbedBuilder.from(embed.data)
            .setDescription(`**Server:** ${message.guild.name}\n**Page:** ${page}/${totalPages}\n\n${newText}`);

          await msg.edit({ 
            embeds: [newEmbed], 
            components: [newRow] 
          });

          collector.resetTimer();
        });

        collector.on('end', () => {
          msg.edit({ components: [] }).catch(() => {});
        });
      }

    } catch (error) {
      console.error('Modstatslb command error:', error);
      await message.reply('Failed to fetch leaderboard.');
    }
  },
};