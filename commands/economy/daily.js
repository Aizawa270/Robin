const {
  claimReward,
  buildEmbed,
  formatMoney,
  formatDuration,
} = require('../../handlers/economyExtras');

const DAILY_REWARD = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
  name: 'daily',
  aliases: [],
  description: 'Claim your daily Crown reward.',
  category: 'economy',
  usage: '$daily',

  async execute(client, message) {
    if (!message.guild) return;

    const result = claimReward(
      message.guild.id,
      message.author.id,
      'daily',
      DAILY_REWARD,
      DAY_MS
    );

    if (!result.ok && result.code === 'cooldown') {
      const embed = buildEmbed(message, {
        title: 'Daily Reward',
        description:
          `You've already claimed your daily reward.\n\n` +
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
            title: 'Daily Reward',
            description:
              'Something went wrong while claiming your reward. Please try again.',
          }),
        ],
      });
    }

    const embed = buildEmbed(message, {
      title: 'Daily Reward',
      description:
        `You claimed **${formatMoney(client, DAILY_REWARD)}**!\n\n` +
        `Come back in **24 hours** to claim again.`,
      thumbnail: message.author.displayAvatarURL({
        size: 256,
      }),
    });

    return message.reply({
      embeds: [embed],
    });
  },
};