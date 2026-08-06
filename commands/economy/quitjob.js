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
  name: 'quitjob',
  aliases: [],
  description: 'Quit your current job.',
  category: 'economy',
  usage: '$quitjob',

  async execute(client, message) {
    if (!message.guild) return;

    const row = client.economy.getUserJobState(message.guild.id, message.author.id);
    if (!row.current_job_id) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'No Job',
            description: 'You are already unemployed.',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const job = client.economy.getJobConfig(message.guild.id, row.current_job_id);
    client.economy.quitJob(message.guild.id, message.author.id);

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Job Quit',
          description: `You have quit your job${job ? ` as **${job.name}**` : ''}.\nYour streak has been reset.`,
          thumbnail: message.guild.iconURL({ size: 256 }),
        }),
      ],
    });
  },
};