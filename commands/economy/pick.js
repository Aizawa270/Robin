const {
  claimCooldown,
  formatDuration,
  formatCurrency,
  buildEmbed,
  awardCrowns,
  randomIntBetween,
  randomLine,
} = require('../../handlers/economyGameHelpers');

const PICK_LINES = {
  broke: [
    'You searched the entire dumpster and found a coupon for emotional damage.',
    'You checked behind a 7-Eleven. All you found was a raccoon judging your life choices.',
    'You dug for treasure and uncovered a single suspicious-looking potato.',
    'You searched an abandoned building. The ghosts asked you to leave.',
    'You found a map leading to a treasure chest. The chest contained another map.',
    'You spent three hours searching for money and found a receipt for someone else’s lunch.',
    'You dug a massive hole. Congratulations, you have discovered dirt.',
    'You picked through a pile of junk and found your self-respect. Unfortunately, it was empty.',
  ],

  small: [
    'You searched between the couch cushions and found the national debt of a very small country.',
    'You found a wallet belonging to someone whose financial decisions are somehow worse than yours.',
    'You found a suspicious bag of Crowns behind a vending machine. The vending machine looked nervous.',
    'You dug through a junkyard and discovered someone's emergency snack fund.',
    'You found some Crowns under a mattress. The mattress wants them back.',
    'You found a tiny treasure chest guarded by one extremely disappointed crab.',
  ],

  decent: [
    'You found a hidden stash beneath a suspiciously expensive gaming chair.',
    'You dug through an old basement and discovered somebody’s forgotten savings.',
    'You located a buried treasure chest. The skeleton guarding it asked for rent money.',
    'You found a bag of Crowns hidden inside a giant rubber duck.',
    'You followed a mysterious treasure map drawn by a six-year-old. Somehow, it worked.',
    'You searched a billionaire’s lost-and-found box. Apparently, they lose a lot of money.',
  ],

  rich: [
    'YOU FOUND A SECRET VAULT. The previous owner is currently screaming somewhere.',
    'You uncovered a dragon’s emergency savings account. The dragon is updating its security.',
    'You discovered an abandoned money-printing machine. The accountants are sweating.',
    'You dug up a pirate’s retirement fund. Arrr, that is one financially responsible pirate.',
  ],

  jackpot: [
    '10,000 CROWNS?! You found the secret vault under Elon Musk’s couch. Act natural.',
    'THE IMPOSSIBLE HAPPENED. You uncovered a legendary treasure chest that was supposed to be a rumour.',
    'You found an ancient Crown vault. Even the economy developers are asking where you got that.',
    'You searched one last place and discovered a ridiculous treasure. Buy a lottery ticket. Actually, don’t.',
  ],
};

function getPickReward() {
  const roll = randomIntBetween(0, 9999);

  if (roll < 1500) return 0;                          // 15%
  if (roll < 4500) return randomIntBetween(1, 100);  // 30%
  if (roll < 7000) return randomIntBetween(101, 350);// 25%
  if (roll < 8500) return randomIntBetween(351, 750);// 15%
  if (roll < 9300) return randomIntBetween(751, 1500);// 8%
  if (roll < 9750) return randomIntBetween(1501, 3000);// 4.5%
  if (roll < 9950) return randomIntBetween(3001, 6000);// 2%
  if (roll < 9990) return randomIntBetween(6001, 9999);// 0.4%

  return 10000; // 0.1% jackpot
}

function getPickLine(reward) {
  if (reward === 10000) return randomLine(PICK_LINES.jackpot);
  if (reward === 0) return randomLine(PICK_LINES.broke);
  if (reward <= 350) return randomLine(PICK_LINES.small);
  if (reward <= 1500) return randomLine(PICK_LINES.decent);

  return reward >= 6000
    ? randomLine(PICK_LINES.rich)
    : randomLine(PICK_LINES.decent);
}

module.exports = {
  name: 'pick',
  aliases: [],
  description: 'Search around for some Crowns.',
  category: 'economy',
  usage: '$pick',

  async execute(client, message) {
    if (!message.guild) return;

    if (typeof client?.economy?.addCrowns !== 'function') {
      return message.reply('The economy system is currently unavailable.');
    }

    const cooldown = claimCooldown(
      message.guild.id,
      message.author.id,
      'pick'
    );

    if (!cooldown.allowed) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Searching Cooldown',
            description:
              `You've already searched recently. The treasure isn't going anywhere.\n\n` +
              `Try again in **${formatDuration(cooldown.remaining)}**.`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const reward = getPickReward();

    try {
      awardCrowns(
        client,
        message.guild.id,
        message.author.id,
        reward,
        'pick'
      );
    } catch (error) {
      console.error('[Pick] Reward failed:', error);

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Search Failed',
            description: 'Something went wrong while processing your reward.',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const line = getPickLine(reward);

    const description =
      `> ${line}\n\n` +
      `**You found:** ${formatCurrency(client, reward)}\n` +
      `**Cooldown:** 30 minutes`;

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: reward === 0 ? 'Nothing But Dust' : 'Search Results',
          description,
          thumbnail: message.guild.iconURL({ size: 256 }),
          footer: 'Ravine Economy',
        }),
      ],
    });
  },
};