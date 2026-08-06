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

module.exports = {
  name: 'serverbank',
  aliases: [],
  description: 'Show the server bank.',
  category: 'economy',
  usage: '$serverbank',

  async execute(client, message) {
    if (!message.guild) return;

    const bank = client.economy.getServerBank(message.guild.id);

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Server Bank',
          description:
            `Balance: **${client.economy.formatCurrency(bank.balance)}**\n` +
            `Total Tax Collected: **${client.economy.formatCurrency(bank.total_tax_collected)}**`,
          thumbnail: message.guild.iconURL({ size: 256 }),
          footer: `${message.guild.name} • Tax treasury`,
        }),
      ],
    });
  },
};