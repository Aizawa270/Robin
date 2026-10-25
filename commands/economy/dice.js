const { EmbedBuilder } = require('discord.js');
const { randomInt } = require('crypto');

const {
  formatDuration,
  useCooldown,
  boostProfit,
} = require('../../handlers/gamblingHelpers');

const MAX_BET = 25_000;
const COOLDOWN_MS = 10_000;
const ANIMATION_DELAY_MS = 400;

// Unicode dice faces used during the rolling animation.
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function randomDiceFace() {
  return DICE_FACES[randomInt(0, DICE_FACES.length)];
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
 * Rolls two different dice.
 *
 * First die: uniformly selected from 1 through 6.
 * Second die: uniformly selected from the five remaining numbers.
 *
 * Every ordered pair of distinct results has the same probability.
 */
function rollDistinctDice() {
  const rollA = randomInt(1, 7);

  // Generate 1–5, then skip the first die's number.
  let rollB = randomInt(1, 6);

  if (rollB >= rollA) {
    rollB += 1;
  }

  return [rollA, rollB];
}

function parsePick(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
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
 * Calculates the base profit for the selected bet.
 *
 * Among the 15 possible unordered pairs of different dice results:
 * - 6 pairs match neither pick.
 * - 8 pairs match exactly one pick.
 * - 1 pair matches both picks.
 *
 * Integer adjustments keep the expected base profit fair for odd bets.
 */
function calculateBaseProfit(amount, matchCount) {
  if (matchCount === 0) {
    return 0;
  }

  const oneMatchProfit = Math.floor(amount / 2);

  const twoMatchProfit =
    (6 * amount) - (8 * oneMatchProfit);

  if (matchCount === 1) {
    return oneMatchProfit;
  }

  if (matchCount === 2) {
    return twoMatchProfit;
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
  aliases: ['roll'],
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

    // Calculate the REAL result once, before starting the animation.
    // The animation is visual only and cannot change the outcome.
    const [rollA, rollB] = rollDistinctDice();

    // Count how many dice match either of the user's two distinct picks.
    const matchCount =
      (rollA === pick1 || rollA === pick2 ? 1 : 0) +
      (rollB === pick1 || rollB === pick2 ? 1 : 0);

    // Calculate the base profit.
    const baseProfit = calculateBaseProfit(amount, matchCount);

    // Preserve the existing economy boost mechanic.
    const boostedProfit =
      baseProfit > 0
        ? boostProfit(client, guildId, userId, baseProfit)
        : 0;

    // The bet has already been deducted.
    // On any match, return the stake and add the profit.
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

    // Prepare the final embed containing the actual two numbers.
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
    // The actual result remains unchanged throughout the animation.
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

    // Replace the rolling animation with the actual results.
    await sleep(ANIMATION_DELAY_MS);

    return sentMessage.edit({
      embeds: [finalEmbed],
    });
  },
};