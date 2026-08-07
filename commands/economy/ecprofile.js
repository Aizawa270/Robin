const { EmbedBuilder } = require('discord.js');
const { resolveTargetUser } = require('../../handlers/economyHelpers');

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
  name: 'ecprofile',
  aliases: ['ecp'],
  description: 'Show economy profile.',
  category: 'economy',
  usage: '$ecprofile [@user|id|username]',

  async execute(client, message, args) {
    if (!message.guild) return;

    const target =
      message.mentions.users.first() ||
      (args[0] ? await resolveTargetUser(client, message, args[0]) : null) ||
      message.author;

    const user = client.economy.getUserStats(message.guild.id, target.id);
    const job = user.current_job_id ? client.economy.getJobConfig(message.guild.id, user.current_job_id) : null;
    const bank = client.economy.getServerBank(message.guild.id);

    const netWorth = Number(user.balance || 0) + Number(bank.balance || 0);
    const workStatus = job ? `Employed as ${job.name}` : 'Unemployed';

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: '⚜ Economic Profile ⚜',
          description:
            `**Net Worth:** ${client.economy.formatCurrency(netWorth)}\n` +
            `**Lifetime Earnings:** ${client.economy.formatCurrency(user.lifetime_earned)}\n` +
            `**Lifetime Spendings:** ${client.economy.formatCurrency(user.lifetime_spent)}\n` +
            `**Work Status:** ${workStatus}`,
          thumbnail: target.displayAvatarURL({ size: 256 }),
          footer: `Requested by ${message.author.username}`,
        }),
      ],
    });
  },
};