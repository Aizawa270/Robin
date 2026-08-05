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

async function resolvePagePrompt(message, totalPages) {
  const promptEmbed = buildEmbed(message, {
    title: 'Go To Page',
    description: `Send a page number between 1 and ${totalPages}.`,
    footer: footerText(message.client),
  });

  const prompt = await message.channel.send({
    embeds: [promptEmbed],
    allowedMentions: { repliedUser: false },
  }).catch(() => null);

  if (!prompt) return null;

  const collected = await message.channel.awaitMessages({
    filter: m => m.author.id === message.author.id && !m.author.bot,
    max: 1,
    time: 15000,
  }).catch(() => null);

  if (prompt) prompt.delete().catch(() => {});

  if (!collected || !collected.size) return null;

  const reply = collected.first();
  const raw = String(reply.content || '').trim().toLowerCase();

  if (raw === 'cancel') {
    reply.delete().catch(() => {});
    return null;
  }

  const page = parseInt(raw, 10);
  reply.delete().catch(() => {});

  if (!Number.isInteger(page)) return null;
  return page;
}

module.exports = {
  name: 'msglb',
  description: 'Show the message leaderboard.',
  category: 'utility',
  usage: '$msglb [total|daily|weekly|monthly] [page]',
  aliases: ['leaderboardmsg', 'msgleaderboard'],

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.messageTracker || !client.msgTrackerDB) {
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
    const totalRows = client.msgTrackerDB.prepare(`
      SELECT COUNT(*) AS count
      FROM message_stats
      WHERE guild_id = ? AND ${scope} > 0
    `).get(message.guild.id).count || 0;

    const totalPages = Math.max(1, Math.ceil(totalRows / perPage));
    if (page > totalPages) page = totalPages;

    const offset = (page - 1) * perPage;

    const rows = client.messageTracker.getLeaderboard(
      message.guild.id,
      scope,
      perPage,
      offset
    ).filter(row => Number(row[scope] || 0) > 0);

    if (!rows.length) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: `Leaderboard Messages (Page ${page}/${totalPages})`,
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

      const member =
        message.guild.members.cache.get(row.user_id) ||
        await message.guild.members.fetch(row.user_id).catch(() => null);

      const name = member?.displayName || member?.user?.username || row.user_id;
      lines.push(`${rank}. ${name} - ${count} messages`);
    }

    const myRank = client.messageTracker.getRank(message.guild.id, message.author.id, scope);

    const embed = buildEmbed(message, {
      title: `Leaderboard Messages (Page ${page}/${totalPages})`,
      description: `${lines.join('\n')}\n\n${message.author.username}'s Position: ${myRank ? `#${myRank}` : 'N/A'}`,
      footer: footerText(client),
    });

    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('msglb_prev')
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId('msglb_page')
        .setLabel('Go To Page')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('msglb_next')
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages)
    );

    const reply = await message.reply({
      embeds: [embed],
      components: [controls],
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async interaction => {
      if (interaction.customId === 'msglb_page') {
        await interaction.deferUpdate().catch(() => {});
        const requested = await resolvePagePrompt(message, totalPages);
        if (!requested) return;

        page = Math.max(1, Math.min(totalPages, requested));
      } else if (interaction.customId === 'msglb_prev') {
        page = Math.max(1, page - 1);
        await interaction.deferUpdate().catch(() => {});
      } else if (interaction.customId === 'msglb_next') {
        page = Math.min(totalPages, page + 1);
        await interaction.deferUpdate().catch(() => {});
      } else {
        return;
      }

      const newOffset = (page - 1) * perPage;
      const newRows = client.messageTracker.getLeaderboard(
        message.guild.id,
        scope,
        perPage,
        newOffset
      ).filter(row => Number(row[scope] || 0) > 0);

      const newLines = [];
      for (let i = 0; i < newRows.length; i++) {
        const row = newRows[i];
        const rank = newOffset + i + 1;
        const count = formatNumber(row[scope]);

        const member =
          message.guild.members.cache.get(row.user_id) ||
          await message.guild.members.fetch(row.user_id).catch(() => null);

        const name = member?.displayName || member?.user?.username || row.user_id;
        newLines.push(`${rank}. ${name} - ${count} messages`);
      }

      const newRank = client.messageTracker.getRank(message.guild.id, message.author.id, scope);

      const updatedEmbed = buildEmbed(message, {
        title: `Leaderboard Messages (Page ${page}/${totalPages})`,
        description: `${newLines.join('\n')}\n\n${message.author.username}'s Position: ${newRank ? `#${newRank}` : 'N/A'}`,
        footer: footerText(client),
      });

      const updatedControls = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('msglb_prev')
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId('msglb_page')
          .setLabel('Go To Page')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('msglb_next')
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages)
      );

      await interaction.message.edit({
        embeds: [updatedEmbed],
        components: [updatedControls],
      }).catch(() => {});
    });

    collector.on('end', async () => {
      const disabled = new ActionRowBuilder().addComponents(
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

      await reply.edit({ components: [disabled] }).catch(() => {});
    });
  },
};