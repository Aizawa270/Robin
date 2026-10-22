const {
  claimReward,
  buildEmbed,
  formatMoney,
  formatDuration,
} = require('../../handlers/economyExtras');

const WEEKLY_REWARD = 15000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = {
  name: 'weekly',
  aliases: [],
  description: 'Claim your weekly Crown reward.',
  category: 'economy',
  usage: '$weekly',

  async execute(client, message) {
    if (!message.guild) return;

    const result = claimReward(
      message.guild.id,
      message.author.id,
      'weekly',
      WEEKLY_REWARD,
      WEEK_MS
    );

    if (!result.ok && result.code === 'cooldown') {
      const embed = buildEmbed(message, {
        title: 'Weekly Reward',
        description:
          `You've already claimed your weekly reward.\n\n` +
          `Come back in **${formatDuration(result.remainingMs)}**.`,
        thumbnail: message.author.displayAvatarURL({
          size: 256,
        }),
      });

      return message.reply({
        embeds: [embed],
      });
    }

    if (!result.ok) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Weekly Reward',
            description:
              'Something went wrong while claiming your reward. Please try again.',
          }),
        ],
      });
    }

    const embed = buildEmbed(message, {
      title: 'Weekly Reward',
      description:
        `You claimed **${formatMoney(client, WEEKLY_REWARD)}**!\n\n` +
        `Come back in **7 days** to claim again.`,
      thumbnail: message.author.displayAvatarURL({
        size: 256,
      }),
    });

    return message.reply({
      embeds: [embed],
    });
  },
};