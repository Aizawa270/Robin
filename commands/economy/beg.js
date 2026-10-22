const {
  COOLDOWN_MS,
  claimCooldown,
  formatDuration,
  formatCurrency,
  buildEmbed,
  awardCrowns,
  randomIntBetween,
  randomLine,
} = require('../../handlers/economyGameHelpers');

const BEG_LINES = {
  broke: [
    'You begged outside a Tesla showroom. Security escorted your broke aura away.',
    'You asked Elon Musk for a loan. He replied with a link to a financial literacy podcast.',
    'You held up a sign saying "Will work for Crowns." A toddler offered you a raisin.',
    'You begged the universe for a financial breakthrough. The universe left you on read.',
    'You tried borrowing money from a pigeon. The pigeon filed a complaint against you.',
    'You applied for a loan using "trust me bro" as collateral. Rejected immediately.',
    'You delivered a motivational speech about poverty. Your audience was three flies.',
    'You asked a Discord mod for money. They gave you a timeout instead.',
    'You tried selling your last brain cell on the black market. Nobody could find it.',
    'You asked a vending machine for financial assistance. It ate your last coin.',
  ],

  small: [
    'A pigeon took pity on you. Its sponsorship budget was embarrassingly small.',
    'You found coins in a sofa, along with a fossilized French fry.',
    'Someone paid you to stop explaining crypto to them.',
    'You performed a terrible magic trick. The audience tipped you out of pity.',
    'You convinced someone that your potato NFT was a sound investment.',
    'A mysterious stranger threw you some Crowns and immediately changed cities.',
    'You returned a shopping cart and discovered that apparently this is a job now.',
    'You found money in an old jacket. The jacket has officially outperformed you.',
  ],

  decent: [
    'You gave a TED Talk titled "Why I Deserve Money." Somehow, it got funded.',
    'A rich guy paid you to stop asking questions about his Lamborghini.',
    'You accidentally became a financial advisor to a group of pigeons.',
    'You sold a motivational course called "Get Rich Slowly." The irony sold it.',
    'Your business plan was terrible, but the investor really liked your confidence.',
    'You convinced a millionaire that you were his long-lost financial advisor.',
  ],

  jackpot: [
    'YOU ACTUALLY WON. Elon Musk personally sponsored your financial comeback. Nobody knows why.',
    'A billionaire dropped his wallet, tripped over his own ego, and accidentally funded your life.',
    'You discovered that a mysterious old man was secretly the Crown economy itself.',
    'The universe finally paid you back for all those embarrassing moments. Character development!',
  ],
};

function getBegReward() {
  const roll = randomIntBetween(0, 9999);

  if (roll < 2000) return 0;                         // 20%
  if (roll < 5000) return randomIntBetween(1, 25);  // 30%
  if (roll < 7500) return randomIntBetween(26, 100);// 25%
  if (roll < 9000) return randomIntBetween(101, 300);// 15%
  if (roll < 9700) return randomIntBetween(301, 700);// 7%
  if (roll < 9900) return randomIntBetween(701, 1200);// 2%
  if (roll < 9990) return randomIntBetween(1201, 1999);// 0.9%

  return 2000; // 0.1% jackpot
}

function getBegLine(reward) {
  if (reward === 2000) return randomLine(BEG_LINES.jackpot);
  if (reward === 0) return randomLine(BEG_LINES.broke);
  if (reward <= 300) return randomLine(BEG_LINES.small);

  return randomLine(BEG_LINES.decent);
}

module.exports = {
  name: 'beg',
  aliases: [],
  description: 'Beg for some Crowns.',
  category: 'economy',
  usage: '$beg',

  async execute(client, message) {
    if (!message.guild) return;

    if (typeof client?.economy?.addCrowns !== 'function') {
      return message.reply('The economy system is currently unavailable.');
    }

    const cooldown = claimCooldown(
      message.guild.id,
      message.author.id,
      'beg'
    );

    if (!cooldown.allowed) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Begging Cooldown',
            description:
              `You've already begged recently. Let your financial humiliation recover.\n\n` +
              `Try again in **${formatDuration(cooldown.remaining)}**.`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const reward = getBegReward();

    try {
      awardCrowns(
        client,
        message.guild.id,
        message.author.id,
        reward,
        'beg'
      );
    } catch (error) {
      console.error('[Beg] Reward failed:', error);

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Begging Failed',
            description: 'Something went wrong while processing your reward.',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const line = getBegLine(reward);

    const description =
      `> ${line}\n\n` +
      `**You received:** ${formatCurrency(client, reward)}\n` +
      `**Cooldown:** 30 minutes`;

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: reward === 0 ? 'Professional Failure' : 'Begging Results',
          description,
          thumbnail: message.guild.iconURL({ size: 256 }),
          footer: 'Ravine Economy',
        }),
      ],
    });
  },
};