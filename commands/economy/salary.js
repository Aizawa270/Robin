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
  name: 'salary',
  aliases: [],
  description: 'Show your current job salary.',
  category: 'economy',
  usage: '$salary',

  async execute(client, message) {
    if (!message.guild) return;

    const row = client.economy.getUserJobState(message.guild.id, message.author.id);
    if (!row.current_job_id) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Salary',
            description: 'You are unemployed.\nUse `$joblist` and then `$startjob <id>`.',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const job = client.economy.getJobConfig(message.guild.id, row.current_job_id);
    if (!job || !job.configured || !job.enabled) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Salary',
            description: 'Your current job is not available right now.',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const last = Number(row.last_work_at || 0);
    const remaining = last ? Math.max(0, job.cooldown_ms - (Date.now() - last)) : 0;
    const todayCount = Number(row.today_work_count || 0);

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Salary',
          description:
            `Job: **${job.name}**\n` +
            `Shift Pay: ${client.economy.formatCurrency(job.shift_pay)}\n` +
            `Works/Day: ${job.works_per_day}\n` +
            `Today: **${todayCount}/${job.works_per_day}**\n` +
            `Cooldown: ${remaining > 0 ? client.economy.formatDuration(remaining) : 'Ready'}`,
          thumbnail: message.guild.iconURL({ size: 256 }),
        }),
      ],
    });
  },
};