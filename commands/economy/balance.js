const { EmbedBuilder } = require('discord.js');
const { resolveTargetUser } = require('../../handlers/economyHelpers');

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${formatNumber(amount)} Crowns`;
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

function footerText(client) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${client.user?.username || 'Bot'} | Today at ${time}`;
}

module.exports = {
  name: 'balance',
  aliases: ['bal', 'wallet'],
  description: 'Show a user balance.',
  category: 'economy',
  usage: '$balance [@user|id|username]',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.economy) {
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

    const target =
      message.mentions.users.first() ||
      (args[0] ? await resolveTargetUser(client, message, args[0]) : null) ||
      message.author;

    const stats = client.economy.getUserStats(message.guild.id, target.id);
    const bank = client.economy.getServerBank(message.guild.id);
    const netWorth = Number(stats.balance || 0) + Number(bank.balance || 0);

    const member =
      message.guild.members.cache.get(target.id) ||
      await message.guild.members.fetch(target.id).catch(() => null);

    const displayName = member?.displayName || target.username;

    const embed = buildEmbed(message, {
      title: `${displayName}'s Balance`,
      description:
        `Balance\n` +
        `↳ ${money(client, stats.balance || 0)}\n\n` +
        `Bank\n` +
        `↳ ${money(client, bank.balance || 0)}\n\n` +
        `Networth\n` +
        `↳ ${money(client, netWorth)}`,
      thumbnail: target.displayAvatarURL({ size: 256 }),
      footer: footerText(client),
    });

    return message.reply({ embeds: [embed] });
  },
};