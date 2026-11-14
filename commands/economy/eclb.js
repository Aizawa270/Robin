const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const {
  getBankBalance,
} = require('../../handlers/economyExtras');

const PER_PAGE = 10;

function formatTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function shortMoney(amount) {
  const value = Number(amount || 0);

  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
  }

  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2).replace(/\.00$/, '')}M`;
  }

  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  }

  return value.toLocaleString('en-US');
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

// ============================================================
// NETWORTH RANKING (wallet + personal bank)
// ============================================================

function getNetworthRanking(client, guildId) {
  const db = client.economy?.db || client.economyDB;

  const rows = db
    .prepare(`
      SELECT user_id, balance
      FROM economy_users
      WHERE guild_id = ?
    `)
    .all(String(guildId));

  const ranking = [];

  for (const row of rows) {
    const wallet = Number(row.balance || 0);

    let bank = 0;
    try {
      bank = Number(getBankBalance(guildId, row.user_id) || 0);
    } catch {
      bank = 0;
    }

    const networth = wallet + bank;
    if (networth <= 0) continue;

    ranking.push({
      user_id: String(row.user_id),
      wallet,
      bank,
      networth,
    });
  }

  ranking.sort((a, b) =>
    b.networth - a.networth ||
    a.user_id.localeCompare(b.user_id)
  );

  return ranking;
}

function makeControls(page, totalPages, disableAll = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('eclb_prev')
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll || page <= 1),
    new ButtonBuilder()
      .setCustomId('eclb_page')
      .setLabel('Go To Page')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll),
    new ButtonBuilder()
      .setCustomId('eclb_next')
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll || page >= totalPages)
  );
}

async function renderPage(client, message, requestedPage) {
  const ranking = getNetworthRanking(client, message.guild.id);

  const totalPages = Math.max(
    1,
    Math.ceil(ranking.length / PER_PAGE)
  );

  const page = Math.max(1, Math.min(totalPages, requestedPage));
  const offset = (page - 1) * PER_PAGE;
  const slice = ranking.slice(offset, offset + PER_PAGE);

  const thumbnail = message.guild.iconURL({ size: 256 });

  if (!slice.length) {
    return {
      page,
      totalPages,
      embed: buildEmbed(message, {
        title: 'Crown Leaderboard (Page 1/1)',
        description: 'No Crown balances found in this server yet.',
        footer: footerText(client),
        thumbnail,
      }),
    };
  }

  const lines = [];

  for (let i = 0; i < slice.length; i++) {
    const row = slice[i];
    const rank = offset + i + 1;

    const member =
      message.guild.members.cache.get(row.user_id) ||
      await message.guild.members.fetch(row.user_id).catch(() => null);

    const name =
      member?.displayName ||
      member?.user?.username ||
      row.user_id;

    lines.push(`${rank}. ${name} - **${shortMoney(row.networth)}**`);
  }

  const myIndex = ranking.findIndex(
    row => row.user_id === message.author.id
  );

  const myRank = myIndex >= 0 ? myIndex + 1 : null;

  return {
    page,
    totalPages,
    embed: buildEmbed(message, {
      title: `Crown Leaderboard (Page ${page}/${totalPages})`,
      description:
        `${lines.join('\n')}\n\n` +
        `${message.author.username}'s Position: ${myRank ? `#${myRank}` : 'N/A'}`,
      footer: footerText(client),
      thumbnail,
    }),
  };
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
  description: 'Show the Crown leaderboard (networth: wallet + bank).',
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

    const first = await renderPage(client, message, page);
    page = first.page;

    let totalPages = first.totalPages;

    const reply = await message.reply({
      embeds: [first.embed],
      components: [makeControls(page, totalPages)],
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

        page = requestedPage;
      } else if (interaction.customId === 'eclb_prev') {
        page = Math.max(1, page - 1);
        await interaction.deferUpdate().catch(() => {});
      } else if (interaction.customId === 'eclb_next') {
        page = page + 1;
        await interaction.deferUpdate().catch(() => {});
      } else {
        return;
      }

      const view = await renderPage(client, message, page);
      page = view.page;
      totalPages = view.totalPages;

      await interaction.message.edit({
        embeds: [view.embed],
        components: [makeControls(page, totalPages)],
      }).catch(() => {});
    });

    collector.on('end', async () => {
      await reply.edit({
        components: [makeControls(page, totalPages, true)],
      }).catch(() => {});
    });
  },
};
