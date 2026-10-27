const { EmbedBuilder } = require('discord.js');
const { randomInt } = require('crypto');

const {
  formatDuration,
  useCooldown,
  boostProfit,
} = require('../../handlers/gamblingHelpers');

const MAX_BET = 25_000;
const COOLDOWN_MS = 10_000;
const ANIMATION_DELAY_MS = 500;

// Discord limits message edits (about 5 per 5 seconds per channel), so keep
// the animation short and skip it when the channel is already busy.
const ANIMATION_FRAMES = 2;

// Unicode dice faces used during the rolling animation.
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Number of dice games currently animating, per channel.
const busyChannels = new Map();

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

    if (data.thumbnail) {
      embed.setThumbnail(data.thumbnail);
    }

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
 * Generates two DIFFERENT dice numbers using weighted match probabilities.
 *
 * 0 matches: 35%
 * 1 match:   53%
 * 2 matches: 12%
 */
function rollDiceForPicks(pick1, pick2) {
  const outcomeRoll = randomInt(0, 100);

  let targetMatches;

  if (outcomeRoll < NO_MATCH_CHANCE) {
    targetMatches = 0;
  } else if (
    outcomeRoll < NO_MATCH_CHANCE + ONE_MATCH_CHANCE
  ) {
    targetMatches = 1;
  } else {
    targetMatches = 2;
  }

  const selectedNumbers = [pick1, pick2];

  const unselectedNumbers = DICE_NUMBERS.filter(
    number => number !== pick1 && number !== pick2
  );

  if (targetMatches === 0) {
    const rollA = randomFrom(unselectedNumbers);

    const remainingNumbers = unselectedNumbers.filter(
      number => number !== rollA
    );

    const rollB = randomFrom(remainingNumbers);

    return [rollA, rollB];
  }

  if (targetMatches === 1) {
    const matchingNumber = randomFrom(selectedNumbers);
    const nonMatchingNumber = randomFrom(unselectedNumbers);

    if (randomInt(0, 2) === 0) {
      return [matchingNumber, nonMatchingNumber];
    }

    return [nonMatchingNumber, matchingNumber];
  }

  if (randomInt(0, 2) === 0) {
    return [pick1, pick2];
  }

  return [pick2, pick1];
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

  if (!/^[1-6]$/.test(text)) {
    return null;
  }

  const number = Number(text);

  return Number.isInteger(number) && number >= 1 && number <= 6
    ? number
    : null;
}

/**
 * 0 matches: lose the stake.
 * 1 match:   profit equals the bet.
 * 2 matches: profit equals twice the bet.
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

// Edit that never throws. Returns true when it worked.
async function tryEdit(sentMessage, payload) {
  try {
    await sentMessage.edit(payload);
    return true;
  } catch (error) {
    console.error('[Dice] Message edit failed:', error?.message || error);
    return false;
  }
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
            description:
              `The maximum bet is **${money(client, MAX_BET)}**.`,
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

    // ------------------------------------------------------------
    // Decide the result and pay out BEFORE any Discord messages.
    // If anything fails here, the bet is refunded.
    // ------------------------------------------------------------
    let settled = false;
    let rollA;
    let rollB;
    let matchCount;
    let boostedProfit;
    let newBalance;

    try {
      [rollA, rollB] = rollDiceForPicks(pick1, pick2);

      matchCount =
        (rollA === pick1 || rollA === pick2 ? 1 : 0) +
        (rollB === pick1 || rollB === pick2 ? 1 : 0);

      const baseProfit = calculateBaseProfit(amount, matchCount);

      boostedProfit =
        baseProfit > 0
          ? Math.max(
              0,
              Math.floor(
                Number(
                  boostProfit(client, guildId, userId, baseProfit)
                ) || 0
              )
            )
          : 0;

      if (matchCount > 0) {
        client.economy.addCrowns(
          guildId,
          userId,
          amount + boostedProfit,
          {
            type: 'dice_win',
            reason: 'Dice winnings',
            actorId: userId,
          }
        );
      }

      settled = true;
      newBalance = client.economy.getBalance(guildId, userId);

    } catch (error) {
      console.error('[Dice] Error while settling bet:', error);

      if (!settled) {
        try {
          client.economy.addCrowns(guildId, userId, amount, {
            type: 'dice_refund',
            reason: 'Dice error refund',
            actorId: userId,
          });
        } catch (refundError) {
          console.error('[Dice] Refund failed:', refundError);
        }
      }

      return message.reply({
        content: 'Something went wrong with the dice. Your bet was refunded.',
      }).catch(() => {});
    }

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

    // ------------------------------------------------------------
    // Show the animation and result. Nothing below can lose money.
    // ------------------------------------------------------------
    const channelId = message.channel.id;
    const activeInChannel = busyChannels.get(channelId) || 0;

    busyChannels.set(channelId, activeInChannel + 1);

    try {
      let sentMessage = null;

      try {
        sentMessage = await message.reply({
          embeds: [
            buildRollingEmbed(message, pick1, pick2, amount, client),
          ],
        });
      } catch (error) {
        console.error('[Dice] Could not send rolling message:', error?.message || error);
      }

      if (!sentMessage) {
        // Original message gone or reply failed: post the result directly.
        await message.channel.send({ embeds: [finalEmbed] }).catch(() => {});
        return;
      }

      // Only animate when nobody else is rolling in this channel.
      const frames = activeInChannel === 0 ? ANIMATION_FRAMES : 0;

      for (let frame = 0; frame < frames; frame++) {
        await sleep(ANIMATION_DELAY_MS);

        await tryEdit(sentMessage, {
          embeds: [
            buildRollingEmbed(message, pick1, pick2, amount, client),
          ],
        });
      }

      await sleep(ANIMATION_DELAY_MS);

      const revealed = await tryEdit(sentMessage, {
        embeds: [finalEmbed],
      });

      if (!revealed) {
        // The edit failed: send the result as a fresh message instead.
        await message.channel.send({ embeds: [finalEmbed] }).catch(error => {
          console.error('[Dice] Could not send result:', error?.message || error);
        });
      }

    } finally {
      const left = (busyChannels.get(channelId) || 1) - 1;

      if (left <= 0) {
        busyChannels.delete(channelId);
      } else {
        busyChannels.set(channelId, left);
      }
    }
  },
};
