const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
  name: 'inviteleaderboard',
  description: 'View the invite leaderboard',
  category: 'info',
  usage: 'inviteleaderboard',
  aliases: ['invitelb', 'invitetop', 'invlb'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    const perPage = 10;
    let currentPage = 0;

    try {
      // Get all invite stats
      const allStats = client.automodDB.prepare(`
        SELECT user_id, invite_count 
        FROM invite_stats
        WHERE guild_id = ? AND invite_count > 0
        ORDER BY invite_count DESC
      `).all(message.guild.id);

      if (allStats.length === 0) {
        return message.reply('No invite statistics found yet.');
      }

      const totalPages = Math.ceil(allStats.length / perPage);

      const generateEmbed = async (page) => {
        const start = page * perPage;
        const end = start + perPage;
        const pageData = allStats.slice(start, end);

        let description = '';
        for (let i = 0; i < pageData.length; i++) {
          const entry = pageData[i];
          const rank = start + i + 1;
          const user = await client.users.fetch(entry.user_id).catch(() => null);
          const username = user ? user.tag : `User ${entry.user_id}`;

          // Medal emojis for top 3
          let medal = '';
          if (rank === 1) medal = '🥇 ';
          else if (rank === 2) medal = '🥈 ';
          else if (rank === 3) medal = '🥉 ';

          description += `${medal}**#${rank}** ${username}\n`;
          description += `└ **${entry.invite_count}** ${entry.invite_count === 1 ? 'invite' : 'invites'}\n\n`;
        }

        return new EmbedBuilder()
          .setColor('#9b59b6')
          .setAuthor({ name: `${message.guild.name} - Invite Leaderboard`, iconURL: message.guild.iconURL() })
          .setDescription(description.trim() || 'No data')
          .setFooter({ text: `Page ${page + 1} of ${totalPages} • Total Members Invited: ${allStats.reduce((a, b) => a + b.invite_count, 0)}` })
          .setTimestamp();
      };

      const generateButtons = (page) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('first')
            .setLabel('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('prev')
            .setLabel('◀️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === totalPages - 1),
          new ButtonBuilder()
            .setCustomId('last')
            .setLabel('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1)
        );
      };

      const embed = await generateEmbed(currentPage);
      const buttons = generateButtons(currentPage);

      const reply = await message.reply({
        embeds: [embed],
        components: totalPages > 1 ? [buttons] : []
      });

      if (totalPages <= 1) return;

      // Button collector
      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minutes
      });

      collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({
            content: 'These buttons are not for you!',
            ephemeral: true
          });
        }

        switch (interaction.customId) {
          case 'first':
            currentPage = 0;
            break;
          case 'prev':
            currentPage = Math.max(0, currentPage - 1);
            break;
          case 'next':
            currentPage = Math.min(totalPages - 1, currentPage + 1);
            break;
          case 'last':
            currentPage = totalPages - 1;
            break;
        }

        const newEmbed = await generateEmbed(currentPage);
        const newButtons = generateButtons(currentPage);

        await interaction.update({
          embeds: [newEmbed],
          components: [newButtons]
        });
      });

      collector.on('end', () => {
        reply.edit({ components: [] }).catch(() => {});
      });

    } catch (err) {
      console.error('[InviteLeaderboard] Error:', err);
      await message.reply('Failed to fetch invite leaderboard.');
    }
  }
};
