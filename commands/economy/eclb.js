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
      thumbnail: data.thumbnail,
      footer: data.footer,
    });

    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.footer) {
      if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
      else embed.setFooter(data.footer);
    }

    return embed;
  }

  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) {
    if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
    else embed.setFooter(data.footer);
  }
  return embed;
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

async function resolvePagePrompt(message, totalPages) {
  const prompt = await message.channel.send({
    embeds: [
      buildEmbed(message, {
        title: 'Go To Page',
        description: `Send a page number between 1 and ${totalPages}.`,
        footer: footerText(message.client),
      }),
    ],
  }).catch(() => null);

  if (!prompt) return null;

  const collected = await message.channel.awaitMessages({
    filter: m => m.author.id === message.author.id && !m.author.bot,
    max: 1,
    time: 15000,
  }).catch(() => null);

  prompt.delete().catch(() => {});

  if (!collected || !collected.size) return null;

  const reply = collected.first();
  const page = parseInt(String(reply.content || '').trim(), 10);
  reply.delete().catch(() => {});

  if (!Number.isInteger(page)) return null;
  return page;
}

module.exports = {
  name: 'eclb',
  aliases: ['ecleaderboard'],
  description: 'Show the Crown leaderboard.',
  category: 'economy',
  usage: '$eclb [page]',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.economy || !client.economyDB) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Economy Unavailable',
            description: 'The economy system is not initialized.',
            footer: footerText(client),
          }),
        ],
      });
    }

    let page = 1;
    if (args[0]) {
      const parsed = parseInt(args[0], 10);
      if (Number.isInteger(parsed) && parsed > 0) page = parsed;
    }

    const perPage = 10;
    const totalRows = client.economy.getEconomySummary(message.guild.id).count || 0;
    const totalPages = Math.max(1, Math.ceil(totalRows / perPage));
    if (page > totalPages) page = totalPages;

    const offset = (page - 1) * perPage;
    const rows = client.economy.getLeaderboard(message.guild.id, perPage, offset);

    if (!rows.length) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Crown Leaderboard (Page 1/1)',
            description: 'No Crown balances found in this server yet.',
            footer: footerText(client),
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const lines = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rank = offset + i + 1;
      const member =
        message.guild.members.cache.get(row.user_id) ||
        await message.guild.members.fetch(row.user_id).catch(() => null);

      const name = member?.displayName || member?.user?.username || row.user_id;
      lines.push(`${rank}. ${name} - ${formatNumber(row.balance)} Crowns`);
    }

    const myRank = client.economy.getRank(message.guild.id, message.author.id);

    const embed = buildEmbed(message, {
      title: `Crown Leaderboard (Page ${page}/${totalPages})`,
      description: `${lines.join('\n')}\n\n${message.author.username}'s Position: ${myRank ? `#${myRank}` : 'N/A'}`,
      footer: footerText(client),
      thumbnail: message.guild.iconURL({ size: 256 }),
    });

    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('eclb_prev')
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId('eclb_page')
        .setLabel('Go To Page')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('eclb_next')
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
      if (interaction.customId === 'eclb_page') {
        await interaction.deferUpdate().catch(() => {});
        const requestedPage = await resolvePagePrompt(message, totalPages);
        if (!requestedPage) return;
        page = Math.max(1, Math.min(totalPages, requestedPage));
      } else if (interaction.customId === 'eclb_prev') {
        page = Math.max(1, page - 1);
        await interaction.deferUpdate().catch(() => {});
      } else if (interaction.customId === 'eclb_next') {
        page = Math.min(totalPages, page + 1);
        await interaction.deferUpdate().catch(() => {});
      } else {
        return;
      }

      const newOffset = (page - 1) * perPage;
      const newRows = client.economy.getLeaderboard(message.guild.id, perPage, newOffset);

      const newLines = [];
      for (let i = 0; i < newRows.length; i++) {
        const row = newRows[i];
        const rank = newOffset + i + 1;

        const member =
          message.guild.members.cache.get(row.user_id) ||
          await message.guild.members.fetch(row.user_id).catch(() => null);

        const name = member?.displayName || member?.user?.username || row.user_id;
        newLines.push(`${rank}. ${name} - ${formatNumber(row.balance)} Crowns`);
      }

      const newRank = client.economy.getRank(message.guild.id, message.author.id);

      const updatedEmbed = buildEmbed(message, {
        title: `Crown Leaderboard (Page ${page}/${totalPages})`,
        description: `${newLines.join('\n')}\n\n${message.author.username}'s Position: ${newRank ? `#${newRank}` : 'N/A'}`,
        footer: footerText(client),
        thumbnail: message.guild.iconURL({ size: 256 }),
      });

      const updatedControls = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('eclb_prev')
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId('eclb_page')
          .setLabel('Go To Page')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('eclb_next')
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
          .setCustomId('eclb_prev')
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('eclb_page')
          .setLabel('Go To Page')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('eclb_next')
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await reply.edit({ components: [disabled] }).catch(() => {});
    });
  },
};