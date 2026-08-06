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
  name: 'joblist',
  aliases: ['jobs'],
  description: 'Show built-in jobs.',
  category: 'economy',
  usage: '$joblist',

  async execute(client, message) {
    if (!message.guild) return;

    const jobs = client.economy.listJobs(message.guild.id);

    const lines = jobs.map(job => {
      const status = job.configured ? 'Available' : 'Not configured';
      const roleText = job.required_role_id ? `<@&${job.required_role_id}>` : 'Unconfigured';
      const shift = job.configured ? client.economy.formatCurrency(job.shift_pay) : '—';
      const bonus = job.configured ? client.economy.formatCurrency(job.weekly_bonus) : '—';

      return [
        `**${job.id}. ${job.name}**`,
        `Requirement: Level ${job.level}`,
        `Role: ${roleText}`,
        `Shift Pay: ${shift}`,
        `7-Day Bonus: ${bonus}`,
        `Works/Day: ${job.works_per_day}`,
        `Status: ${status}`,
      ].join('\n');
    });

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Job List',
          description: `Use \`$startjob <id>\` to apply.\n\n${lines.join('\n\n')}`,
          thumbnail: message.guild.iconURL({ size: 256 }),
          footer: `${message.guild.name} • Built-in jobs`,
        }),
      ],
    });
  },
};