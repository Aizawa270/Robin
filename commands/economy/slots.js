'use strict';

const { EmbedBuilder } = require('discord.js');
const { randomInt } = require('crypto');

const {
  formatDuration,
  useCooldown,
  boostProfit,
  withGamblingLock,
} = require('../../handlers/gamblingHelpers');

// ============================================================
// CONFIGURATION
// ============================================================

const MIN_BET = 100;
const MAX_BET = 25_000;

const COOLDOWN_MS = 10_000;
const ANIMATION_DELAY_MS = 500;

const SYMBOLS = [
  'SEVEN',
  'DIAMOND',
  'CROWN',
  'BELL',
  'CHERRY',
  'BAR',
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Prevent excessive animation edits in the same channel.
const busyChannels = new Map();

// Cache application owner information.
const ownerCache = new WeakMap();

// ============================================================
// STANDARD ODDS
// Total probability: 100%
// ============================================================

const STANDARD_ODDS = [
  {
    weight: 50,
    type: 'triple',
    symbol: 'SEVEN',
    multiplier: 5,
  },
  {
    weight: 150,
    type: 'triple',
    symbol: 'DIAMOND',
    multiplier: 4,
  },
  {
    weight: 300,
    type: 'triple',
    symbol: 'CROWN',
    multiplier: 3,
  },
  {
    weight: 700,
    type: 'triple',
    symbol: 'BELL',
    multiplier: 2,
  },
  {
    weight: 1200,
    type: 'triple',
    symbol: 'CHERRY',
    multiplier: 1.5,
  },
  {
    weight: 1600,
    type: 'triple',
    symbol: 'BAR',
    multiplier: 1.2,
  },
  {
    weight: 2500,
    type: 'pair',
    multiplier: 0.5,
  },
  {
    weight: 3500,
    type: 'miss',
    multiplier: 0,
  },
];

// ============================================================
// OWNER ODDS
// These are internal probability adjustments.
// They do not change the multipliers or embeds.
//
// The bot owner still has a chance to lose.
// ============================================================

const OWNER_ODDS = [
  {
    weight: 80,
    type: 'triple',
    symbol: 'SEVEN',
    multiplier: 5,
  },
  {
    weight: 200,
    type: 'triple',
    symbol: 'DIAMOND',
    multiplier: 4,
  },
  {
    weight: 400,
    type: 'triple',
    symbol: 'CROWN',
    multiplier: 3,
  },
  {
    weight: 800,
    type: 'triple',
    symbol: 'BELL',
    multiplier: 2,
  },
  {
    weight: 1300,
    type: 'triple',
    symbol: 'CHERRY',
    multiplier: 1.5,
  },
  {
    weight: 1700,
    type: 'triple',
    symbol: 'BAR',
    multiplier: 1.2,
  },
  {
    weight: 2600,
    type: 'pair',
    multiplier: 0.5,
  },
  {
    weight: 2920,
    type: 'miss',
    multiplier: 0,
  },
];

// ============================================================
// OWNER DETECTION
// Uses Discord application ownership.
// BOT_OWNER_ID / BOT_OWNER_IDS can be used as a fallback.
// ============================================================

function addOwnerInformation(owner, ids) {
  if (!owner) return;

  if (owner.id) {
    ids.add(String(owner.id));
  }

  const members = owner.members;
  const collection = members?.cache || members;

  if (collection?.values) {
    for (const member of collection.values()) {
      const id = member?.id || member?.user?.id;

      if (id) {
        ids.add(String(id));
      }
    }
  }
}

async function isBotOwner(client, userId) {
  if (!client || typeof client !== 'object') {
    return false;
  }

  const cached = ownerCache.get(client);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.ids.has(String(userId));
  }

  const ids = new Set();

  // Optional environment-variable fallback.
  const environmentOwners = [
    process.env.BOT_OWNER_ID,
    process.env.BOT_OWNER_IDS,
    client.ownerId,
  ];

  for (const value of environmentOwners) {
    if (!value) continue;

    String(value)
      .split(/[,\s]+/)
      .filter(Boolean)
      .forEach(id => ids.add(id));
  }

  try {
    let application = client.application;

    if (
      application &&
      !application.owner &&
      typeof application.fetch === 'function'
    ) {
      application = await application.fetch();
    }

    addOwnerInformation(application?.owner, ids);
  } catch (error) {
    console.error(
      '[Slots] Could not retrieve application owner:',
      error?.message || error
    );
  }

  ownerCache.set(client, {
    ids,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  return ids.has(String(userId));
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
// ECONOMY FORMATTER
// ============================================================

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

// ============================================================
// RANDOM HELPERS
// ============================================================

function randomFrom(array) {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error('Cannot choose from an empty array.');
  }

  return array[randomInt(0, array.length)];
}

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);

    [result[i], result[j]] = [
      result[j],
      result[i],
    ];
  }

  return result;
}

// ============================================================
// OUTCOME GENERATOR
// ============================================================

function chooseOutcome(isOwner) {
  const odds = isOwner
    ? OWNER_ODDS
    : STANDARD_ODDS;

  let roll = randomInt(0, 10_000);

  for (const outcome of odds) {
    if (roll < outcome.weight) {
      return outcome;
    }

    roll -= outcome.weight;
  }

  return odds[odds.length - 1];
}

function generateReels(outcome) {
  if (outcome.type === 'triple') {
    return [
      outcome.symbol,
      outcome.symbol,
      outcome.symbol,
    ];
  }

  if (outcome.type === 'pair') {
    const matchingSymbol = randomFrom(SYMBOLS);

    const otherSymbols = SYMBOLS.filter(
      symbol => symbol !== matchingSymbol
    );

    const differentSymbol = randomFrom(otherSymbols);

    return shuffle([
      matchingSymbol,
      matchingSymbol,
      differentSymbol,
    ]);
  }

  // A miss must have three different symbols.
  return shuffle(SYMBOLS).slice(0, 3);
}

function rollSlots(isOwner) {
  const outcome = chooseOutcome(isOwner);

  return {
    ...outcome,
    reels: generateReels(outcome),
  };
}

// ============================================================
// ANIMATION EMBEDS
// ============================================================

function buildRollingEmbed(
  message,
  amount,
  client,
  reels,
  stage
) {
  const displayedReels = reels.map(
    symbol => symbol || 'SPINNING'
  );

  return buildEmbed(message, {
    title: 'Slots',
    description:
      `**Bet:** ${money(client, amount)}\n\n` +
      `### Reels\n` +
      `\`[ ${displayedReels.join(' ] [ ')} ]\`\n\n` +
      `*${stage}*`,
    thumbnail: message.author.displayAvatarURL({
      size: 256,
    }),
    footer: `Requested by ${message.author.username}`,
  });
}

// ============================================================
// FINAL RESULT EMBED
// ============================================================

function buildResultEmbed(
  message,
  client,
  amount,
  result,
  payout,
  newBalance
) {
  const { multiplier, type, reels } = result;

  let heading;

  if (type === 'triple' && reels[0] === 'SEVEN') {
    heading = 'JACKPOT';
  } else if (type === 'triple') {
    heading = 'WIN';
  } else if (type === 'pair') {
    heading = 'PARTIAL RETURN';
  } else {
    heading = 'NO MATCH';
  }

  const net = payout - amount;

  let resultDetails;

  if (net > 0) {
    resultDetails =
      `**Profit:** +${money(client, net)}`;
  } else if (net < 0) {
    resultDetails =
      `**Net Loss:** ${money(client, Math.abs(net))}`;
  } else {
    resultDetails = '**Result:** Break even';
  }

  return buildEmbed(message, {
    title: `Slots | ${heading}`,
    description:
      `### Reels\n` +
      `\`[ ${reels.join(' ] [ ')} ]\`\n\n` +
      `**Bet:** ${money(client, amount)}\n` +
      `**Multiplier:** x${multiplier}\n` +
      `**Payout:** ${money(client, payout)}\n` +
      `${resultDetails}\n\n` +
      `**Balance:** ${money(client, newBalance)}`,
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
      '[Slots] Message edit failed:',
      error?.message || error
    );

    return false;
  }
}

// ============================================================
// CLAN GAME TRACKING
// ============================================================

async function trackClanGame(client, message, result) {
  try {
    const tracker = client?.clanSystem?.trackGame;

    if (typeof tracker === 'function') {
      await tracker(message, 'slots', result);
    }
  } catch (error) {
    console.error(
      '[Slots] Clan quest tracking failed:',
      error?.message || error
    );
  }
}

// ============================================================
// COMMAND
// ============================================================

module.exports = {
  name: 'slots',
  aliases: ['slot'],
  description: 'Spin the slots and win Crowns.',
  category: 'economy',
  usage: '$slots <amount>',

  execute: withGamblingLock(
    'slots',
    async function execute(client, message, args) {

      if (!message.guild) return;

      const economy = client?.economy;

      if (
        !economy ||
        typeof economy.getBalance !== 'function' ||
        typeof economy.removeCrowns !== 'function' ||
        typeof economy.addCrowns !== 'function'
      ) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Economy Unavailable',
              description: 'The economy system is not ready.',
            }),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      // ------------------------------------------------------
      // BET VALIDATION
      // ------------------------------------------------------

      const amountText = String(args[0] ?? '').trim();

      if (!/^\d+$/.test(amountText)) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Slots',
              description:
                'Enter a valid whole-number bet.\n\n' +
                'Usage: `$slots <amount>`',
            }),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const amount = Number(amountText);

      if (
        !Number.isSafeInteger(amount) ||
        amount < MIN_BET
      ) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Slots',
              description:
                `The minimum bet is **${money(client, MIN_BET)}**.`,
            }),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      if (amount > MAX_BET) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Slots',
              description:
                `The maximum bet is **${money(client, MAX_BET)}**.`,
            }),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const guildId = message.guild.id;
      const userId = message.author.id;

      const balance = Number(
        economy.getBalance(guildId, userId)
      ) || 0;

      if (balance < amount) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Slots',
              description:
                `You only have **${money(client, balance)}**.`,
            }),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      // ------------------------------------------------------
      // COOLDOWN
      // ------------------------------------------------------

      const remaining = useCooldown(
        guildId,
        userId,
        'slots',
        COOLDOWN_MS
      );

      if (remaining > 0) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Slots',
              description:
                `You are on cooldown for **${formatDuration(remaining)}**.`,
            }),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      // ------------------------------------------------------
      // DETERMINE OWNER STATUS
      // ------------------------------------------------------

      const isOwner = await isBotOwner(
        client,
        userId
      );

      // ------------------------------------------------------
      // TAKE BET
      // ------------------------------------------------------

      const removed = economy.removeCrowns(
        guildId,
        userId,
        amount,
        {
          type: 'slots_bet',
          reason: 'Slots bet',
          actorId: userId,
        }
      );

      if (!removed) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Slots',
              description: 'You do not have enough Crowns.',
            }),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      // ------------------------------------------------------
      // DETERMINE RESULT AND SETTLE
      // ------------------------------------------------------

      let result;
      let payout = 0;
      let baseProfit = 0;
      let boostedProfit = 0;

      let settled = false;
      let settlementError = null;

      try {
        result = rollSlots(isOwner);

        if (result.multiplier > 1) {
          baseProfit = Math.floor(
            amount * (result.multiplier - 1)
          );

          boostedProfit = Math.max(
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
          );

          // Return original stake plus boosted profit.
          payout = amount + boostedProfit;

        } else if (result.multiplier > 0) {
          // Partial return. Boosts do not increase returned stake.
          payout = Math.floor(
            amount * result.multiplier
          );
        }

        if (payout > 0) {
          const credited = economy.addCrowns(
            guildId,
            userId,
            payout,
            {
              type: 'slots_payout',
              reason: 'Slots winnings',
              actorId: userId,
            }
          );

          if (credited === false) {
            throw new Error('Could not credit slots payout.');
          }
        }

        settled = true;

      } catch (error) {
        settlementError = error;

        console.error(
          '[Slots] Settlement failed:',
          error
        );

        if (!settled) {
          try {
            economy.addCrowns(
              guildId,
              userId,
              amount,
              {
                type: 'slots_refund',
                reason: 'Slots error refund',
                actorId: userId,
              }
            );
          } catch (refundError) {
            console.error(
              '[Slots] Bet refund failed:',
              refundError
            );
          }
        }
      }

      if (settlementError) {
        return message.reply({
          content:
            'Something went wrong with the slots. Your bet was refunded.',
          allowedMentions: { repliedUser: false },
        }).catch(() => null);
      }

      // ------------------------------------------------------
      // GET FINAL BALANCE
      // ------------------------------------------------------

      let newBalance = 0;

      try {
        newBalance = economy.getBalance(
          guildId,
          userId
        );
      } catch (error) {
        console.error(
          '[Slots] Balance retrieval failed:',
          error
        );
      }

      // ------------------------------------------------------
      // CLAN TRACKING
      // ------------------------------------------------------

      await trackClanGame(
        client,
        message,
        payout > amount
      );

      // ------------------------------------------------------
      // FINAL EMBED
      // ------------------------------------------------------

      const finalEmbed = buildResultEmbed(
        message,
        client,
        amount,
        result,
        payout,
        newBalance
      );

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
                amount,
                client,
                [null, null, null],
                'The reels are spinning...'
              ),
            ],
            allowedMentions: {
              repliedUser: false,
            },
          });
        } catch (error) {
          console.error(
            '[Slots] Could not send spinning message:',
            error?.message || error
          );
        }

        if (!sentMessage) {
          await message.channel.send({
            embeds: [finalEmbed],
          }).catch(error => {
            console.error(
              '[Slots] Could not send final result:',
              error?.message || error
            );
          });

          return;
        }

        // Only animate fully when another Slots animation
        // is not already running in this channel.
        if (activeInChannel === 0) {
          await sleep(ANIMATION_DELAY_MS);

          await tryEdit(sentMessage, {
            embeds: [
              buildRollingEmbed(
                message,
                amount,
                client,
                [result.reels[0], null, null],
                'First reel locked...'
              ),
            ],
          });

          await sleep(ANIMATION_DELAY_MS);

          await tryEdit(sentMessage, {
            embeds: [
              buildRollingEmbed(
                message,
                amount,
                client,
                [result.reels[0], result.reels[1], null],
                'Second reel locked...'
              ),
            ],
          });

          await sleep(ANIMATION_DELAY_MS);

        } else {
          await sleep(ANIMATION_DELAY_MS);
        }

        // Reveal the result in the SAME message.
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
              '[Slots] Could not send result:',
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