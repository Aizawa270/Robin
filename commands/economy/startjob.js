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
  name: 'startjob',
  aliases: [],
  description: 'Start a built-in job.',
  category: 'economy',
  usage: '$startjob <id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const jobId = args[0];
    if (!jobId) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Start Job',
            description: 'Use: `$startjob <job id>`',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const result = client.economy.startJob(message.guild.id, message.author.id, jobId, {
      member: message.member,
      timestamp: Date.now(),
    });

    if (!result.ok) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Job Application Failed',
            description: result.message,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Job Started',
          description:
            `You are now employed as **${result.job.name}**.\n` +
            `Shift Pay: ${client.economy.formatCurrency(result.job.shift_pay)}\n` +
            `7-Day Bonus: ${client.economy.formatCurrency(result.job.weekly_bonus)}`,
          thumbnail: message.guild.iconURL({ size: 256 }),
        }),
      ],
    });
  },
};