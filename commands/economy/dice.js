const { EmbedBuilder } = require('discord.js');
const { randomInt } = require('crypto');

const {
  formatDuration,
  useCooldown,
  boostProfit,
} = require('../../handlers/gamblingHelpers');

const MAX_BET = 25_000;
const COOLDOWN_MS = 10_000;
const ANIMATION_DELAY_MS = 300;

// Unicode dice faces used during the rolling animation.
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Desired outcome probabilities, out of 100.
const NO_MATCH_CHANCE = 35;
const ONE_MATCH_CHANCE = 53;
const TWO_MATCH_CHANCE = 12;

const DICE_NUMBERS = [1, 2, 3, 4, 5, 6];

function randomDiceFace() {
  return DICE_FACES[randomInt(0, DICE_FACES.length)];
}

function randomFrom(array) {
  return array[randomInt(0, array.length)];
}

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
      if (typeof data.footer === 'string') {
        embed.setFooter({ text: data.footer });
      } else {
        embed.setFooter(data.footer);
      }
    }

    return embed;
  }

  const embed = new EmbedBuilder()
    .setColor('#5b0000')
    .setTimestamp();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);

  if (data.footer) {
    if (typeof data.footer === 'string') {
      embed.setFooter({ text: data.footer });
    } else {
      embed.setFooter(data.footer);
    }
  }

  return embed;
}

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

/**
 * Generates dice results using the configured match probabilities.
 *
 * 0 matches: 35%
 * 1 match:   53%
 * 2 matches: 12%
 *
 * Both dice may show the same number.
 *
 * The category is selected first, then dice are generated that
 * produce exactly that category under the existing match-count rules.
 */
function rollDiceForPicks(pick1, pick2) {
  const outcomeRoll = randomInt(0, 100);

  let targetMatches;

  if (outcomeRoll < NO_MATCH_CHANCE) {
    targetMatches = 0;
  } else if (outcomeRoll < NO_MATCH_CHANCE + ONE_MATCH_CHANCE) {
    targetMatches = 1;
  } else {
    targetMatches = 2;
  }

  const selectedNumbers = [pick1, pick2];

  const unselectedNumbers = DICE_NUMBERS.filter(
    number => number !== pick1 && number !== pick2
  );

  // 35%: Neither die matches either selected number.
  // Repeated unselected numbers are allowed.
  if (targetMatches === 0) {
    const rollA = randomFrom(unselectedNumbers);
    const rollB = randomFrom(unselectedNumbers);

    return [rollA, rollB];
  }

  // 53%: Exactly one die matches either selected number.
  if (targetMatches === 1) {
    const matchingNumber = randomFrom(selectedNumbers);
    const nonMatchingNumber = randomFrom(unselectedNumbers);

    // Randomize which die shows the matching number.
    if (randomInt(0, 2) === 0) {
      return [matchingNumber, nonMatchingNumber];
    }

    return [nonMatchingNumber, matchingNumber];
  }

  // 12%: Both dice match either selected number.
  // Both dice can show the same selected number.
  const rollA = randomFrom(selectedNumbers);
  const rollB = randomFrom(selectedNumbers);

  return [rollA, rollB];
}

function parsePick(raw) {
  if (
    raw === undefined ||
    raw === null ||
    String(raw).trim() === ''
  ) {
    return null;
  }

  const text = String(raw).trim();

  // Only accept a whole-number input.
  if (!/^[1-6]$/.test(text)) {
    return null;
  }

  const number = Number(text);

  return Number.isInteger(number) && number >= 1 && number <= 6
    ? number
    : null;
}

/**
 * Calculates profit separately from the returned stake.
 *
 * 0 matches: lose the stake.
 * 1 match:   profit equals the bet.
 * 2 matches: profit equals twice the bet.
 *
 * The existing boost mechanic can increase positive profit.
 */
function calculateBaseProfit(amount, matchCount) {
  if (matchCount === 1) {
    return amount;
  }

  if (matchCount === 2) {
    return amount * 2;
  }

  return 0;
}

/**
 * Creates an embed showing the rolling dice.
 */
function buildRollingEmbed(message, pick1, pick2, amount, client) {
  return buildEmbed(message, {
    title: '🎲 Dice Rolling...',
    description:
      `**Bet:** ${money(client, amount)}\n` +
      `**Your Picks:** ${pick1}, ${pick2}\n\n` +
      `### Rolling the Dice\n` +
      `${randomDiceFace()}　${randomDiceFace()}\n\n` +
      '*The dice are rolling...*',
    thumbnail: message.author.displayAvatarURL({ size: 256 }),
    footer: `Requested by ${message.author.username}`,
  });
}

module.exports = {
  name: 'dice',
  aliases: ['roll', 'd'],
  description: 'Pick two dice numbers and try your luck.',
  category: 'economy',
  usage: '$dice <amount> <number1> <number2>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.economy) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Economy Unavailable',
            description: 'The economy system is not ready.',
          }),
        ],
      });
    }

    // Validate the bet.
    const amountText = String(args[0] ?? '').trim();

    if (!/^\d+$/.test(amountText)) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Dice',
            description: 'Enter a valid whole-number bet.',
          }),
        ],
      });
    }

    const amount = Number(amountText);

    const pick1 = parsePick(args[1]);
    const pick2 = parsePick(args[2]);

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !pick1 ||
      !pick2 ||
      pick1 === pick2
    ) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '🎲 Dice',
            description:
              'Use: `$dice <amount> <number1> <number2>`\n' +
              'Your two picks must be different numbers between **1 and 6**.',
          }),
        ],
      });
    }

    if (amount > MAX_BET) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '🎲 Dice',
            description: `The maximum bet is **${money(client, MAX_BET)}**.`,
          }),
        ],
      });
    }

    const guildId = message.guild.id;
    const userId = message.author.id;

    const balance = client.economy.getBalance(guildId, userId);

    if (balance < amount) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '🎲 Dice',
            description: `You only have **${money(client, balance)}**.`,
          }),
        ],
      });
    }

    // Check cooldown before taking currency.
    const remaining = useCooldown(
      guildId,
      userId,
      'dice',
      COOLDOWN_MS
    );

    if (remaining > 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '🎲 Dice',
            description:
              `You are on cooldown for **${formatDuration(remaining)}**.`,
          }),
        ],
      });
    }

    // Collect the bet.
    const removed = client.economy.removeCrowns(
      guildId,
      userId,
      amount,
      {
        type: 'dice_bet',
        reason: 'Dice bet',
        actorId: userId,
      }
    );

    if (!removed) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: '🎲 Dice',
            description: 'You do not have enough Crowns.',
          }),
        ],
      });
    }

    // Calculate the actual result before the animation.
    // The animation never changes the result or payout.
    const [rollA, rollB] = rollDiceForPicks(pick1, pick2);

    // Count each die that matches either selected number.
    // Two dice showing the same selected number count as 2 matches.
    const matchCount =
      (rollA === pick1 || rollA === pick2 ? 1 : 0) +
      (rollB === pick1 || rollB === pick2 ? 1 : 0);

    // Calculate profit using the new payout rules.
    const baseProfit = calculateBaseProfit(amount, matchCount);

    // Preserve the existing economy boost mechanic.
    const boostedProfit =
      baseProfit > 0
        ? boostProfit(client, guildId, userId, baseProfit)
        : 0;

    // The bet has already been deducted.
    // On any match, return the stake plus the profit.
    if (matchCount > 0) {
      const payout = amount + boostedProfit;

      client.economy.addCrowns(
        guildId,
        userId,
        payout,
        {
          type: 'dice_win',
          reason: 'Dice winnings',
          actorId: userId,
        }
      );
    }

    const newBalance = client.economy.getBalance(guildId, userId);

    let resultText;

    if (matchCount === 0) {
      resultText =
        '### No Match!\n' +
        'You matched **0** numbers and lost **' +
        `${money(client, amount)}**.`;
    } else if (boostedProfit === 0) {
      resultText =
        '### Matched!\n' +
        `You matched **${matchCount}** number` +
        `${matchCount === 1 ? '' : 's'}. ` +
        'Your bet was returned, so you broke even.';
    } else {
      resultText =
        '### Good Guess!\n' +
        `You matched **${matchCount}** number` +
        `${matchCount === 1 ? '' : 's'} and earned a profit of ` +
        `**${money(client, boostedProfit)}**.`;
    }

    // Prepare the final embed showing the actual dice results.
    const finalEmbed = buildEmbed(message, {
      title: '🎲 Dice Rolled',
      description:
        `**Bet:** ${money(client, amount)}\n` +
        `**Your Picks:** ${pick1}, ${pick2}\n\n` +
        `### Results\n` +
        `Rolled: **${rollA}, ${rollB}**\n\n` +
        `${resultText}\n\n` +
        `**Balance:** ${money(client, newBalance)}`,
      thumbnail: message.author.displayAvatarURL({ size: 256 }),
      footer: `Requested by ${message.author.username}`,
    });

    // Send the initial rolling embed.
    const sentMessage = await message.reply({
      embeds: [
        buildRollingEmbed(message, pick1, pick2, amount, client),
      ],
    });

    // Animate the dice by editing the SAME message.
    for (let frame = 0; frame < 3; frame++) {
      await sleep(ANIMATION_DELAY_MS);

      const rollingEmbed = buildRollingEmbed(
        message,
        pick1,
        pick2,
        amount,
        client
      );

      await sentMessage.edit({
        embeds: [rollingEmbed],
      });
    }

    // Reveal the final results.
    await sleep(ANIMATION_DELAY_MS);

    return sentMessage.edit({
      embeds: [finalEmbed],
    });
  },
};