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

    const todayCount = Number(user.today_work_count || 0);
    const workLine = job
      ? `${todayCount}/${job.works_per_day} today`
      : 'Unemployed';

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: `${target.username}'s Economy Profile`,
          description:
            `**Balance:** ${client.economy.formatCurrency(user.balance)}\n` +
            `**Current Job:** ${job ? job.name : 'Unemployed'}\n` +
            `**Work Streak:** ${Number(user.work_streak || 0)}/7\n` +
            `**Today:** ${workLine}\n` +
            `**Lifetime Earned:** ${client.economy.formatCurrency(user.lifetime_earned)}\n` +
            `**Lifetime Tax Paid:** ${client.economy.formatCurrency(user.lifetime_tax_paid)}\n` +
            `**Server Bank:** ${client.economy.formatCurrency(bank.balance)}`,
          thumbnail: target.displayAvatarURL({ size: 256 }),
          footer: `${message.guild.name} • Economy profile`,
        }),
      ],
    });
  },
};