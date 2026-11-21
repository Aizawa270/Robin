'use strict';

const { EmbedBuilder } = require('discord.js');
const { randomInt } = require('crypto');

const {
  formatDuration,
  useCooldown,
  boostProfit,
  withGamblingLock,
} = require('../../handlers/gamblingHelpers');

// Persistent rigs are managed by commands/economy/rig.js.
const { isDiceRigged } = require('./rig');

const MAX_BET = 25_000;
const COOLDOWN_MS = 10_000;
const ANIMATION_DELAY_MS = 500;
const ANIMATION_FRAMES = 2;

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const DICE_NUMBERS = [1, 2, 3, 4, 5, 6];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Number of dice games currently animating, per channel.
const busyChannels = new Map();

// ============================================================
// STANDARD ODDS
// ============================================================

const NO_MATCH_CHANCE = 35;
const ONE_MATCH_CHANCE = 53;

// ============================================================
// PERSISTENT RIG ODDS
// Only apply when a rigged user picks 5 and 2.
// ============================================================

const RIGGED_NO_MATCH_CHANCE = 18;
const RIGGED_ONE_MATCH_CHANCE = 55;

// ============================================================
// CLAN TRACKING
// ============================================================

async function trackClanGame(client, message, game, result) {
  try {
    const tracker = client?.clanSystem?.trackGame;

    if (typeof tracker === 'function') {
      await tracker(message, game, result);
    }
  } catch (error) {
    console.error(
      `[${game}] Clan quest tracking failed:`,
      error
    );
  }
}

// ============================================================
// RANDOM HELPERS
// ============================================================

function randomDiceFace() {
  return DICE_FACES[randomInt(0, DICE_FACES.length)];
}

function randomFrom(array) {
  if (!Array.isArray(array) || !array.length) {
    throw new Error(
      'Cannot choose from an empty dice result array.'
    );
  }

  return array[randomInt(0, array.length)];
}

// ============================================================
// EMBED BUILDER
// ============================================================

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
      embed.setFooter(
        typeof data.footer === 'string'
          ? { text: data.footer }
          : data.footer
      );
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
    embed.setFooter(
      typeof data.footer === 'string'
        ? { text: data.footer }
        : data.footer
    );
  }

  return embed;
}

// ============================================================
// CURRENCY FORMATTER
// ============================================================

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

// ============================================================
// DICE RESULT GENERATOR
//
// Standard:
// 0 matches: 35%
// 1 match:   53%
// 2 matches: 12%
//
// Active rig + picks 5 and 2:
// 0 matches: 18%
// 1 match:   55%
// 2 matches: 27%
// ============================================================

function rollDiceForPicks(
  pick1,
  pick2,
  rigged = false
) {
  const noMatchChance = rigged
    ? RIGGED_NO_MATCH_CHANCE
    : NO_MATCH_CHANCE;

  const oneMatchChance = rigged
    ? RIGGED_ONE_MATCH_CHANCE
    : ONE_MATCH_CHANCE;

  const outcomeRoll = randomInt(0, 100);

  let targetMatches;

  if (outcomeRoll < noMatchChance) {
    targetMatches = 0;

  } else if (
    outcomeRoll < noMatchChance + oneMatchChance
  ) {
    targetMatches = 1;

  } else {
    targetMatches = 2;
  }

  const selectedNumbers = [pick1, pick2];

  const unselectedNumbers = DICE_NUMBERS.filter(
    number => number !== pick1 && number !== pick2
  );

  // ----------------------------------------------------------
  // NO MATCH
  // ----------------------------------------------------------

  if (targetMatches === 0) {
    const rollA = randomFrom(unselectedNumbers);

    const remainingNumbers = unselectedNumbers.filter(
      number => number !== rollA
    );

    const rollB = randomFrom(remainingNumbers);

    return [rollA, rollB];
  }

  // ----------------------------------------------------------
  // ONE MATCH
  // ----------------------------------------------------------

  if (targetMatches === 1) {
    const matchingNumber = randomFrom(selectedNumbers);

    const nonMatchingNumber = randomFrom(unselectedNumbers);

    return randomInt(0, 2) === 0
      ? [matchingNumber, nonMatchingNumber]
      : [nonMatchingNumber, matchingNumber];
  }

  // ----------------------------------------------------------
  // TWO MATCHES
  // ----------------------------------------------------------

  return randomInt(0, 2) === 0
    ? [pick1, pick2]
    : [pick2, pick1];
}

// ============================================================
// PICK VALIDATION
// ============================================================

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

  return Number.isInteger(number) &&
    number >= 1 &&
    number <= 6
      ? number
      : null;
}

// ============================================================
// PAYOUT CALCULATION
// ============================================================

function calculateBaseProfit(amount, matchCount) {
  if (matchCount === 1) return amount;
  if (matchCount === 2) return amount * 2;

  return 0;
}

// ============================================================
// ANIMATION EMBED
// ============================================================

function buildRollingEmbed(
  message,
  pick1,
  pick2,
  amount,
  client
) {
  return buildEmbed(message, {
    title: '🎲 Dice Rolling...',

    description:
      `**Bet:** ${money(client, amount)}\n` +
      `**Your Picks:** ${pick1}, ${pick2}\n\n` +
      `### Rolling the Dice\n` +
      `${randomDiceFace()}　${randomDiceFace()}\n\n` +
      '*The dice are rolling...*',

    thumbnail: message.author.displayAvatarURL({
      size: 256,
    }),

    footer: `Requested by ${message.author.username}`,
  });
}

// ============================================================
// SAFE MESSAGE EDIT
// ============================================================

async function tryEdit(sentMessage, payload) {
  try {
    await sentMessage.edit(payload);
    return true;
  } catch (error) {
    console.error(
      '[Dice] Message edit failed:',
      error?.message || error
    );

    return false;
  }
}

// ============================================================
// COMMAND
// ============================================================

module.exports = {
  name: 'dice',
  aliases: ['roll', 'd'],
  description: 'Pick two dice numbers and try your luck.',
  category: 'economy',
  usage: '$dice <amount> <number1> <number2>',

  execute: withGamblingLock(
    'dice',
    async function execute(client, message, args) {

      if (!message.guild) return;

      // ------------------------------------------------------
      // ECONOMY CHECK
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // ARGUMENT VALIDATION
      // ------------------------------------------------------

      const amountText = String(
        args[0] ?? ''
      ).trim();

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

      // ------------------------------------------------------
      // BALANCE CHECK
      // ------------------------------------------------------

      const guildId = message.guild.id;
      const userId = message.author.id;

      const balance = client.economy.getBalance(
        guildId,
        userId
      );

      if (balance < amount) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: '🎲 Dice',
              description:
                `You only have **${money(client, balance)}**.`,
            }),
          ],
        });
      }

      // ------------------------------------------------------
      // COOLDOWN
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // PERSISTENT RIG CHECK
      //
      // An active rig only affects this user when they pick 5 and 2.
      // The order of the two picks does not matter.
      // ------------------------------------------------------

      const useEnhancedOdds =
        isDiceRigged(guildId, userId) &&
        (
          (pick1 === 5 && pick2 === 2) ||
          (pick1 === 2 && pick2 === 5)
        );

      // ------------------------------------------------------
      // TAKE BET
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // RESOLVE AND SETTLE
      // ------------------------------------------------------

      let rollA;
      let rollB;
      let matchCount;
      let boostedProfit;
      let newBalance;

      let settled = false;

      try {
        [rollA, rollB] = rollDiceForPicks(
          pick1,
          pick2,
          useEnhancedOdds
        );

        matchCount =
          (rollA === pick1 || rollA === pick2 ? 1 : 0) +
          (rollB === pick1 || rollB === pick2 ? 1 : 0);

        const baseProfit = calculateBaseProfit(
          amount,
          matchCount
        );

        boostedProfit = baseProfit > 0
          ? Math.max(
              0,
              Math.floor(
                Number(
                  boostProfit(
                    client,
                    guildId,
                    userId,
                    baseProfit
                  )
                ) || 0
              )
            )
          : 0;

        if (matchCount > 0) {
          const credited = client.economy.addCrowns(
            guildId,
            userId,
            amount + boostedProfit,
            {
              type: 'dice_win',
              reason: 'Dice winnings',
              actorId: userId,
            }
          );

          if (credited === false) {
            throw new Error(
              'Could not credit dice winnings.'
            );
          }
        }

        settled = true;

      } catch (error) {
        console.error(
          '[Dice] Error while settling bet:',
          error
        );

        if (!settled) {
          try {
            client.economy.addCrowns(
              guildId,
              userId,
              amount,
              {
                type: 'dice_refund',
                reason: 'Dice error refund',
                actorId: userId,
              }
            );
          } catch (refundError) {
            console.error(
              '[Dice] Refund failed:',
              refundError
            );
          }
        }

        return message.reply({
          content:
            'Something went wrong with the dice. Your bet was refunded.',
          allowedMentions: {
            repliedUser: false,
          },
        }).catch(() => null);
      }

      // ------------------------------------------------------
      // GET UPDATED BALANCE
      // ------------------------------------------------------

      try {
        newBalance = client.economy.getBalance(
          guildId,
          userId
        );
      } catch (error) {
        console.error(
          '[Dice] Balance retrieval failed:',
          error?.message || error
        );

        newBalance = balance - amount + (
          matchCount > 0 ? amount + boostedProfit : 0
        );
      }

      // ------------------------------------------------------
      // CLAN TRACKING
      // ------------------------------------------------------

      await trackClanGame(
        client,
        message,
        'dice',
        matchCount > 0
      );

      // ------------------------------------------------------
      // RESULT TEXT
      // ------------------------------------------------------

      let resultText;

      if (matchCount === 0) {
        resultText =
          '### No Match!\n' +
          `You matched **0** numbers and lost **${money(client, amount)}**.`;

      } else if (boostedProfit === 0) {
        resultText =
          '### Matched!\n' +
          `You matched **${matchCount}** number${matchCount === 1 ? '' : 's'}. ` +
          'Your bet was returned, so you broke even.';

      } else {
        resultText =
          '### Good Guess!\n' +
          `You matched **${matchCount}** number${matchCount === 1 ? '' : 's'} and earned a profit of ` +
          `**${money(client, boostedProfit)}**.`;
      }

      // ------------------------------------------------------
      // FINAL EMBED
      // ------------------------------------------------------

      const finalEmbed = buildEmbed(message, {
        title: '🎲 Dice Rolled',

        description:
          `**Bet:** ${money(client, amount)}\n` +
          `**Your Picks:** ${pick1}, ${pick2}\n\n` +
          `### Results\n` +
          `Rolled: **${rollA}, ${rollB}**\n\n` +
          `${resultText}\n\n` +
          `**Balance:** ${money(client, newBalance)}`,

        thumbnail: message.author.displayAvatarURL({
          size: 256,
        }),

        footer: `Requested by ${message.author.username}`,
      });

      // ------------------------------------------------------
      // ANIMATION
      // ------------------------------------------------------

      const channelId = message.channel.id;

      const activeInChannel =
        busyChannels.get(channelId) || 0;

      busyChannels.set(
        channelId,
        activeInChannel + 1
      );

      try {
        let sentMessage = null;

        try {
          sentMessage = await message.reply({
            embeds: [
              buildRollingEmbed(
                message,
                pick1,
                pick2,
                amount,
                client
              ),
            ],

            allowedMentions: {
              repliedUser: false,
            },
          });

        } catch (error) {
          console.error(
            '[Dice] Could not send rolling message:',
            error?.message || error
          );
        }

        if (!sentMessage) {
          await message.channel.send({
            embeds: [finalEmbed],
          }).catch(() => {});

          return;
        }

        const frames = activeInChannel === 0
          ? ANIMATION_FRAMES
          : 0;

        for (let frame = 0; frame < frames; frame++) {
          await sleep(ANIMATION_DELAY_MS);

          await tryEdit(sentMessage, {
            embeds: [
              buildRollingEmbed(
                message,
                pick1,
                pick2,
                amount,
                client
              ),
            ],
          });
        }

        await sleep(ANIMATION_DELAY_MS);

        const revealed = await tryEdit(
          sentMessage,
          {
            embeds: [finalEmbed],
          }
        );

        if (!revealed) {
          await message.channel.send({
            embeds: [finalEmbed],
          }).catch(error => {
            console.error(
              '[Dice] Could not send result:',
              error?.message || error
            );
          });
        }

      } finally {
        const left =
          (busyChannels.get(channelId) || 1) - 1;

        if (left <= 0) {
          busyChannels.delete(channelId);
        } else {
          busyChannels.set(channelId, left);
        }
      }
    }
  ),
};