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
  name: 'work',
  aliases: [],
  description: 'Work your current job.',
  category: 'economy',
  usage: '$work',

  async execute(client, message) {
    if (!message.guild) return;

    const result = client.economy.workShift(
      client,
      message.guild.id,
      message.author.id,
      message.member,
      Date.now()
    );

    if (!result.ok) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Work Failed',
            description: result.message,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const lines = [
      `Job: **${result.job.name}**`,
      `Shift Pay: ${client.economy.formatCurrency(result.grossShift)}`,
      `Tax: -${client.economy.formatCurrency(result.shiftTax)}`,
      `You Received: ${client.economy.formatCurrency(result.shiftNet)}`,
      `Streak: **${result.streak}/7**`,
      `Today: **${result.todayCount}/${result.job.works_per_day}**`,
    ];

    if (result.streakBonusTriggered) {
      lines.push(`Bonus: ${client.economy.formatCurrency(result.bonusNet)} received`);
    }

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Shift Complete',
          description: lines.join('\n'),
          thumbnail: message.guild.iconURL({ size: 256 }),
        }),
      ],
    });
  },
};