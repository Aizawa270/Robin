const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

function formatTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function footerText(client) {
  return `${client.user?.username || 'Bot'} | Today at ${formatTime()}`;
}

function buildEmbed(message, data = {}) {
  if (typeof message.createEmbed === 'function') {
    const embed = message.createEmbed({
      title: data.title,
      description: data.description,
      footer: data.footer,
    });

    if (data.footer) {
      if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
      else embed.setFooter(data.footer);
    }

    return embed;
  }

  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.footer) {
    if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
    else embed.setFooter(data.footer);
  }
  return embed;
}

function scopeToColumn(scope) {
  const normalized = String(scope || 'total').toLowerCase();
  if (['daily', 'weekly', 'monthly', 'total'].includes(normalized)) return normalized;
  return 'total';
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

module.exports = {
  name: 'msglb',
  description: 'Show the message leaderboard.',
  category: 'utility',
  usage: '$msglb [total|daily|weekly|monthly] [page]',
  aliases: ['leaderboardmsg', 'msgleaderboard'],

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.messageTracker) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Message Tracker Unavailable',
            description: 'The message tracker is not initialized.',
            footer: footerText(client),
          }),
        ],
      });
    }

    let scope = 'total';
    let page = 1;

    if (args[0]) {
      const first = String(args[0]).toLowerCase();
      if (['total', 'daily', 'weekly', 'monthly'].includes(first)) {
        scope = first;
        page = parseInt(args[1], 10) || 1;
      } else {
        page = parseInt(args[0], 10) || 1;
      }
    }

    page = Math.max(1, page);
    scope = scopeToColumn(scope);

    const perPage = 10;
    const offset = (page - 1) * perPage;

    const rows = client.messageTracker.getLeaderboard(
      message.guild.id,
      scope,
      perPage,
      offset
    );

    const totalRows = client.messageTracker.getLeaderboard(
      message.guild.id,
      scope,
      1000,
      0
    ).length;

    const totalPages = Math.max(1, Math.ceil(totalRows / perPage));

    if (!rows.length) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: `Leaderboard Messages (Page 1/1)`,
            description: 'No tracked messages found in this server yet.',
            footer: footerText(client),
          }),
        ],
      });
    }

    const lines = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rank = offset + i + 1;
      const count = formatNumber(row[scope]);
      lines.push(`${rank}. <@${row.user_id}> - ${count} messages`);
    }

    const myRank = client.messageTracker.getRank(message.guild.id, message.author.id, scope);

    const embed = buildEmbed(message, {
      title: `Leaderboard Messages (Page ${page}/${totalPages})`,
      description: `${lines.join('\n')}\n\n${message.author.username}'s Position: ${myRank ? `#${myRank}` : 'N/A'}`,
      footer: footerText(client),
    });

    const prevDisabled = page <= 1;
    const nextDisabled = page >= totalPages;

    const rowButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('msglb_prev')
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(prevDisabled),
      new ButtonBuilder()
        .setCustomId('msglb_page')
        .setLabel('Go To Page')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('msglb_next')
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(nextDisabled)
    );

    const reply = await message.reply({
      embeds: [embed],
      components: [rowButtons],
    });

    if (totalPages === 1) return;

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async interaction => {
      if (interaction.customId === 'msglb_prev' && page > 1) page--;
      if (interaction.customId === 'msglb_next' && page < totalPages) page++;

      const newOffset = (page - 1) * perPage;
      const newRows = client.messageTracker.getLeaderboard(
        message.guild.id,
        scope,
        perPage,
        newOffset
      );

      const newLines = [];
      for (let i = 0; i < newRows.length; i++) {
        const row = newRows[i];
        const rank = newOffset + i + 1;
        const count = formatNumber(row[scope]);
        newLines.push(`${rank}. <@${row.user_id}> - ${count} messages`);
      }

      const newRank = client.messageTracker.getRank(message.guild.id, message.author.id, scope);

      const updatedEmbed = buildEmbed(message, {
        title: `Leaderboard Messages (Page ${page}/${totalPages})`,
        description: `${newLines.join('\n')}\n\n${message.author.username}'s Position: ${newRank ? `#${newRank}` : 'N/A'}`,
        footer: footerText(client),
      });

      const updatedButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('msglb_prev')
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId('msglb_page')
          .setLabel('Go To Page')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('msglb_next')
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages)
      );

      await interaction.update({
        embeds: [updatedEmbed],
        components: [updatedButtons],
      });
    });

    collector.on('end', async () => {
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('msglb_prev')
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('msglb_page')
          .setLabel('Go To Page')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('msglb_next')
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await reply.edit({ components: [disabledRow] }).catch(() => {});
    });
  },
};