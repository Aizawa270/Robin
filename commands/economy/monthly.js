const {
claimReward,
buildEmbed,
formatMoney,
formatDuration,
} = require('../../handlers/economyExtras');

const MONTHLY_REWARD = 100000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

module.exports = {
name: 'monthly',
aliases: [],
description: 'Claim your monthly Crown reward.',
category: 'economy',
usage: '$monthly',

async execute(client, message) {
if (!message.guild) return;

const result = claimReward(
  message.guild.id,
  message.author.id,
  'monthly',
  MONTHLY_REWARD,
  MONTH_MS
);

if (!result.ok && result.code === 'cooldown') {
  const embed = buildEmbed(message, {
    title: 'Monthly Reward',
    description:
      `You've already claimed your monthly reward.\n\n` +
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
        title: 'Monthly Reward',
        description:
          'Something went wrong while claiming your reward. Please try again.',
      }),
    ],
  });
}

const embed = buildEmbed(message, {
  title: 'Monthly Reward',
  description:
    `You claimed **${formatMoney(client, MONTHLY_REWARD)}**!\n\n` +
    `Come back in **30 days** to claim again.`,
  thumbnail: message.author.displayAvatarURL({
    size: 256,
  }),
});

return message.reply({
  embeds: [embed],
});

},
};