const { EmbedBuilder } = require('discord.js');

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

  const embed = new EmbedBuilder().setColor('#5b0000').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) {
    if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
    else embed.setFooter(data.footer);
  }
  return embed;
}

function fmt(ts) {
  return new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

module.exports = {
  name: 'taxhistory',
  aliases: [],
  description: 'Show recent tax history.',
  category: 'economy',
  usage: '$taxhistory',

  async execute(client, message) {
    if (!message.guild) return;

    const rows = client.economy.getTaxHistory(message.guild.id, 10, 0);

    const description = rows.length
      ? rows.map((r, i) => {
          return [
            `**${i + 1}. ${r.source}**`,
            `Gross: ${client.economy.formatCurrency(r.gross)}`,
            `Tax: ${client.economy.formatCurrency(r.tax)}`,
            `Net: ${client.economy.formatCurrency(r.net)}`,
            `Bank Added: ${client.economy.formatCurrency(r.bank_added)}`,
            `Date: ${fmt(r.timestamp)}`,
          ].join('\n');
        }).join('\n\n')
      : 'No tax records yet.';

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Tax History',
          description,
          thumbnail: message.guild.iconURL({ size: 256 }),
          footer: `${message.guild.name} • Last 10 records`,
        }),
      ],
    });
  },
};