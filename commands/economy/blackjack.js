'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const { randomBytes, randomInt } = require('crypto');

const {
  formatDuration,
  useCooldown,
  boostProfit,
  acquireGamblingLocks,
  releaseGamblingLocks,
  replyGamblingBusy,
} = require('../../handlers/gamblingHelpers');

// ============================================================
// CONFIGURATION
// ============================================================

const MAX_BET = 25_000;
const COOLDOWN_MS = 10_000;

const TURN_TIMEOUT_MS = 120_000;
const CHALLENGE_TIMEOUT_MS = 120_000;

// One active blackjack session per player.
const activeGames = new Map();

// Owner detection cache.
const ownerCache = new WeakMap();

// ============================================================
// GENERAL HELPERS
// ============================================================

function gameKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function releaseSessionLocks(session) {
  if (!session || session.locksReleased) return;

  session.locksReleased = true;

  const userIds = session.lockUserIds || [];

  for (const userId of userIds) {
    const key = gameKey(session.guild.id, userId);

    if (activeGames.get(key) === session) {
      activeGames.delete(key);
    }
  }

  releaseGamblingLocks(
    session.guild.id,
    userIds,
    'blackjack'
  );
}

// ============================================================
// EMBEDS
// ============================================================

function buildEmbed(message, data = {}) {
  if (typeof message?.createEmbed === 'function') {
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

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

// ============================================================
// BOT OWNER DETECTION
// Used for SOLO blackjack only.
// ============================================================

function addOwnerInformation(owner, ids) {
  if (!owner) return;

  if (owner.id) {
    ids.add(String(owner.id));
  }

  if (owner.ownerId) {
    ids.add(String(owner.ownerId));
  }

  const members = owner.members?.cache || owner.members;

  if (members?.values) {
    for (const member of members.values()) {
      const id =
        member?.user?.id ||
        member?.userId ||
        member?.id;

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

  const configuredOwners = [
    process.env.BOT_OWNER_ID,
    process.env.BOT_OWNER_IDS,
    client.ownerId,
  ];

  for (const value of configuredOwners) {
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
      '[Blackjack] Owner detection failed:',
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
// CARDS
// ============================================================

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];

  const ranks = [
    'A',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'J',
    'Q',
    'K',
  ];

  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }

  // Cryptographically shuffled deck.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);

    [deck[i], deck[j]] = [
      deck[j],
      deck[i],
    ];
  }

  return deck;
}

function drawCard(deck) {
  if (!deck.length) {
    throw new Error('The blackjack deck is empty.');
  }

  return deck.pop();
}

function cardString(card) {
  return `${card.rank}${card.suit}`;
}

function handValue(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === 'A') {
      total += 11;
      aces += 1;
    } else if (['K', 'Q', 'J'].includes(card.rank)) {
      total += 10;
    } else {
      total += Number.parseInt(card.rank, 10);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function isNaturalBlackjack(hand) {
  return (
    hand.length === 2 &&
    handValue(hand) === 21
  );
}

// ============================================================
// OWNER-WEIGHTED SOLO CARD DRAW
//
// This does not modify the actual deck.
// It only changes the selection weight for the owner's cards.
//
// The dealer and every 1v1 game use normal draws.
// ============================================================

function drawOwnerWeightedCard(deck, hand) {
  if (!deck.length) {
    throw new Error('The blackjack deck is empty.');
  }

  const candidates = deck.map((card, index) => {
    let weight = 100;

    if (hand.length === 0) {
      // Slight preference for Aces and 10-value opening cards.
      if (
        card.rank === 'A' ||
        ['10', 'J', 'Q', 'K'].includes(card.rank)
      ) {
        weight = 120;
      }
    } else if (
      hand.length === 1 &&
      isNaturalBlackjack([...hand, card])
    ) {
      // Better chance of receiving a natural blackjack.
      weight = 160;
    } else {
      const projectedTotal = handValue([
        ...hand,
        card,
      ]);

      if (projectedTotal > 21) {
        weight = 70;
      } else {
        weight = 125;
      }
    }

    return {
      index,
      weight,
    };
  });

  const totalWeight = candidates.reduce(
    (total, candidate) => total + candidate.weight,
    0
  );

  let roll = randomInt(0, totalWeight);

  for (const candidate of candidates) {
    if (roll < candidate.weight) {
      return deck.splice(candidate.index, 1)[0];
    }

    roll -= candidate.weight;
  }

  return drawCard(deck);
}

function drawSoloPlayerCard(session) {
  if (session.ownerAdvantage) {
    return drawOwnerWeightedCard(
      session.deck,
      session.playerHand
    );
  }

  return drawCard(session.deck);
}

// ============================================================
// SOLO BUTTONS
// ============================================================

function activeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bj_hit')
      .setLabel('Hit')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('bj_stand')
      .setLabel('Stand')
      .setStyle(ButtonStyle.Secondary)
  );
}

function disabledSoloRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bj_hit')
      .setLabel('Hit')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),

    new ButtonBuilder()
      .setCustomId('bj_stand')
      .setLabel('Stand')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

// ============================================================
// SOLO EMBED
// ============================================================

function renderSoloEmbed(
  session,
  revealDealer = false,
  status = 'Your move'
) {
  const playerCards = session.playerHand
    .map(cardString)
    .join('  ');

  const dealerCards = revealDealer
    ? session.dealerHand.map(cardString).join('  ')
    : `${cardString(session.dealerHand[0])}  Hidden`;

  const playerTotal = handValue(session.playerHand);

  const dealerTotal = revealDealer
    ? handValue(session.dealerHand)
    : 'Hidden';

  return buildEmbed(session.messageRef, {
    title: 'Blackjack',

    description:
      `**Bet:** ${money(session.client, session.bet)}\n\n` +

      `**Your Hand:**\n${playerCards || '—'}\n` +
      `**Total:** ${playerTotal}\n\n` +

      `**Dealer Hand:**\n${dealerCards || '—'}\n` +
      `**Total:** ${dealerTotal}\n\n` +

      `**Status:** ${status}`,

    thumbnail: session.user.displayAvatarURL({
      size: 256,
    }),

    footer: `Requested by ${session.user.username}`,
  });
}

// ============================================================
// SOLO FINALIZATION
// ============================================================

async function finalizeSoloGame(session) {
  if (session.ended) return;

  session.ended = true;
  session.collector?.stop('game_finished');

  try {
    let outcome = 'loss';
    let payout = 0;
    let baseProfit = 0;

    const playerTotal = handValue(session.playerHand);

    const playerNatural = isNaturalBlackjack(
      session.playerHand
    );

    const dealerNatural = isNaturalBlackjack(
      session.dealerHand
    );

    if (playerTotal > 21) {
      outcome = 'loss';

    } else if (playerNatural && dealerNatural) {
      outcome = 'push';

    } else if (playerNatural) {
      outcome = 'win';
      baseProfit = Math.floor(session.bet * 1.5);

    } else if (dealerNatural) {
      outcome = 'loss';

    } else {
      // Dealer stands on 17 or higher.
      while (handValue(session.dealerHand) < 17) {
        session.dealerHand.push(
          drawCard(session.deck)
        );
      }

      const dealerTotal = handValue(session.dealerHand);

      if (
        dealerTotal > 21 ||
        playerTotal > dealerTotal
      ) {
        outcome = 'win';
        baseProfit = session.bet;

      } else if (playerTotal === dealerTotal) {
        outcome = 'push';

      } else {
        outcome = 'loss';
      }
    }

    if (outcome === 'win') {
      const profit = Math.max(
        0,
        Math.floor(
          Number(
            boostProfit(
              session.client,
              session.guild.id,
              session.user.id,
              baseProfit
            )
          ) || 0
        )
      );

      payout = session.bet + profit;

      session.client.economy.addCrowns(
        session.guild.id,
        session.user.id,
        payout,
        {
          type: 'blackjack_win',
          reason: playerNatural
            ? 'Natural blackjack'
            : 'Blackjack win',
          actorId: session.user.id,
        }
      );
    }

    if (outcome === 'push') {
      payout = session.bet;

      session.client.economy.addCrowns(
        session.guild.id,
        session.user.id,
        payout,
        {
          type: 'blackjack_push',
          reason: 'Blackjack push refund',
          actorId: session.user.id,
        }
      );
    }

    await trackClanGame(
      session.client,
      session.messageRef,
      'blackjack',
      outcome === 'win'
        ? true
        : outcome === 'loss'
          ? false
          : null
    );

    const profit = outcome === 'win'
      ? payout - session.bet
      : 0;

    let resultText;

    if (outcome === 'win') {
      resultText =
        `### You Won!\n` +
        `You earned **${money(session.client, profit)}**.`;

      if (playerNatural) {
        resultText += '\nNatural Blackjack payout.';
      }

    } else if (outcome === 'push') {
      resultText =
        '### Push!\nYour bet has been refunded.';

    } else {
      resultText =
        `### You Lost!\n` +
        `You lost **${money(session.client, session.bet)}**.`;
    }

    const newBalance = session.client.economy.getBalance(
      session.guild.id,
      session.user.id
    );

    const embed = buildEmbed(
      session.messageRef,
      {
        title: 'Blackjack',

        description:
          `**Bet:** ${money(session.client, session.bet)}\n\n` +

          `**Your Hand:**\n` +
          `${session.playerHand.map(cardString).join('  ')} ` +
          `(**${handValue(session.playerHand)}**)\n\n` +

          `**Dealer Hand:**\n` +
          `${session.dealerHand.map(cardString).join('  ')} ` +
          `(**${handValue(session.dealerHand)}**)\n\n` +

          `${resultText}\n\n` +
          `**Balance:** ${money(session.client, newBalance)}`,

        thumbnail: session.user.displayAvatarURL({
          size: 256,
        }),

        footer: `Requested by ${session.user.username}`,
      }
    );

    await session.message?.edit({
      embeds: [embed],
      components: [disabledSoloRow()],
    }).catch(() => {});

  } catch (error) {
    console.error(
      '[Blackjack] Settlement failed:',
      error
    );

    await session.message?.edit({
      embeds: [
        buildEmbed(session.messageRef, {
          title: 'Blackjack',
          description:
            'The game ended, but the result could not be displayed. ' +
            'Please contact an administrator if your balance looks incorrect.',
        }),
      ],
      components: [disabledSoloRow()],
    }).catch(() => {});

  } finally {
    releaseSessionLocks(session);
  }
}

// ============================================================
// SOLO GAME COLLECTOR
// ============================================================

function startSoloCollector(session) {
  const collector = session.message.createMessageComponentCollector({
    time: TURN_TIMEOUT_MS,

    filter: interaction =>
      ['bj_hit', 'bj_stand'].includes(
        interaction.customId
      ),
  });

  session.collector = collector;

  collector.on('collect', async interaction => {
    if (session.ended) return;

    if (interaction.user.id !== session.user.id) {
      return interaction.reply({
        content: 'This is not your blackjack hand.',
        ephemeral: true,
      }).catch(() => {});
    }

    if (session.processing) {
      return interaction.reply({
        content: 'Your previous action is still processing.',
        ephemeral: true,
      }).catch(() => {});
    }

    session.processing = true;

    try {
      await interaction.deferUpdate().catch(() => {});

      if (session.ended) return;

      if (interaction.customId === 'bj_hit') {
        session.playerHand.push(
          drawSoloPlayerCard(session)
        );

        const total = handValue(session.playerHand);

        if (total >= 21) {
          await finalizeSoloGame(session);
          return;
        }

        await session.message.edit({
          embeds: [
            renderSoloEmbed(
              session,
              false,
              'Your move'
            ),
          ],
          components: [activeRow()],
        }).catch(() => {});

        collector.resetTimer({
          time: TURN_TIMEOUT_MS,
        });

      } else if (interaction.customId === 'bj_stand') {
        await finalizeSoloGame(session);
      }

    } catch (error) {
      console.error(
        '[Blackjack] Player action failed:',
        error
      );

      await finalizeSoloGame(session);

    } finally {
      session.processing = false;
    }
  });

  collector.on('end', async () => {
    if (!session.ended) {
      await finalizeSoloGame(session);
    }
  });
}

// ============================================================
// RESOLVE CHALLENGE TARGET
// ============================================================

async function resolveOpponent(message, raw) {
  const mentionedMember =
    message.mentions?.members?.first?.();

  if (mentionedMember) {
    if (mentionedMember.id === message.author.id) {
      return {
        error: 'You cannot challenge yourself.',
      };
    }

    if (mentionedMember.user.bot) {
      return {
        error: 'You cannot challenge a bot.',
      };
    }

    return {
      member: mentionedMember,
    };
  }

  const mentionedUser =
    message.mentions?.users?.first?.();

  let id = mentionedUser?.id || null;

  if (!id) {
    const text = String(raw || '').trim();

    const match =
      text.match(/^<@!?(\d+)>$/) ||
      text.match(/^(\d{16,22})$/);

    id = match?.[1] || null;
  }

  if (!id) {
    return {
      error: 'Mention a server member or provide their user ID.',
    };
  }

  if (id === message.author.id) {
    return {
      error: 'You cannot challenge yourself.',
    };
  }

  const member =
    message.guild.members.cache.get(id) ||
    await message.guild.members.fetch(id).catch(() => null);

  if (!member) {
    return {
      error: 'That user is not a member of this server.',
    };
  }

  if (member.user.bot) {
    return {
      error: 'You cannot challenge a bot.',
    };
  }

  return {
    member,
  };
}

// ============================================================
// CHALLENGE BUTTONS
// ============================================================

function challengeRow(session, disabled = false) {
  const prefix = `bjchallenge_${session.token}`;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}_accept`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`${prefix}_reject`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

// ============================================================
// CHALLENGE EMBED
// ============================================================

function renderChallengeEmbed(session, status = 'pending') {
  let description;

  if (status === 'pending') {
    description =
      `**Challenger:** ${session.playerUser.username}\n` +
      `**Dealer:** ${session.dealerUser.username}\n\n` +

      `**Stake per person:** ${money(session.client, session.bet)}\n` +
      `**Total pot:** ${money(session.client, session.bet * 2)}\n\n` +

      `You have been challenged to a Blackjack match.\n\n` +

      `If you accept, you will take the dealer's side. ` +
      `The challenger will play against an automated dealer.\n\n` +

      `The dealer's second card remains hidden until the game ends. ` +
      `The dealer draws until reaching 17.\n\n` +

      `You must accept before the challenge expires.`;

  } else if (status === 'declined') {
    description =
      `**${session.dealerUser.username}** declined the challenge.\n\n` +
      'No Crowns were taken.';

  } else if (status === 'expired') {
    description =
      `The challenge to **${session.dealerUser.username}** expired.\n\n` +
      'No Crowns were taken.';

  } else {
    description =
      'The challenge could not be started.\n\n' +
      'No bets were retained.';
  }

  return buildEmbed(session.messageRef, {
    title: 'Blackjack Challenge',
    description,

    thumbnail: session.playerUser.displayAvatarURL({
      size: 256,
    }),

    footer: `Challenged by ${session.playerUser.username}`,
  });
}

// ============================================================
// CANCEL PENDING CHALLENGE
// ============================================================

async function cancelPendingChallenge(
  session,
  status,
  interaction = null
) {
  if (session.status !== 'pending') return;

  session.status = status;
  session.ended = true;

  session.inviteCollector?.stop(status);

  await session.message?.edit({
    embeds: [
      renderChallengeEmbed(session, status),
    ],
    components: [],
  }).catch(() => {});

  releaseSessionLocks(session);
}

// ============================================================
// DEALER GAME BUTTONS
// ============================================================

function duelPlayerRow(session, disabled = false) {
  const prefix = `bjduel_${session.token}`;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}_hit`)
      .setLabel('Hit')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`${prefix}_stand`)
      .setLabel('Stand')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

// ============================================================
// 1V1 GAME EMBED
//
// The challenger is the player.
// The accepted opponent takes the dealer side.
// Dealer's second card is hidden.
// ============================================================

function renderDuelEmbed(session) {
  const playerCards = session.playerHand
    .map(cardString)
    .join('  ');

  const dealerCards =
    `${cardString(session.dealerHand[0])}  Hidden`;

  return buildEmbed(session.messageRef, {
    title: 'Blackjack | Dealer Challenge',

    description:
      `**Player:** ${session.playerUser.username}\n` +
      `**Dealer:** ${session.dealerUser.username}\n\n` +

      `**Stake:** ${money(session.client, session.bet)} each\n` +
      `**Total Pot:** ${money(session.client, session.bet * 2)}\n\n` +

      `**Your Hand:**\n${playerCards}\n` +
      `**Total:** ${handValue(session.playerHand)}\n\n` +

      `**Dealer Hand:**\n${dealerCards}\n` +
      `**Total:** Hidden\n\n` +

      `**Status:** Your move\n\n` +
      `The dealer stands on 17 or higher.`,

    thumbnail: session.playerUser.displayAvatarURL({
      size: 256,
    }),

    footer: `Player: ${session.playerUser.username}`,
  });
}

// ============================================================
// 1V1 FINAL EMBED
// ============================================================

function renderDuelResultEmbed(
  session,
  outcome,
  payout,
  newBalance
) {
  const playerTotal = handValue(session.playerHand);
  const dealerTotal = handValue(session.dealerHand);

  let resultText;

  if (outcome === 'player_win') {
    resultText =
      `### ${session.playerUser.username} Wins!\n` +
      `Payout: **${money(session.client, payout)}**`;

  } else if (outcome === 'dealer_win') {
    resultText =
      `### ${session.dealerUser.username} Wins!\n` +
      `Payout: **${money(session.client, payout)}**`;

  } else {
    resultText =
      '### Push!\nBoth bets have been refunded.';
  }

  return buildEmbed(session.messageRef, {
    title: 'Blackjack | Final Result',

    description:
      `**Stake per person:** ${money(session.client, session.bet)}\n\n` +

      `**Player: ${session.playerUser.username}**\n` +
      `${session.playerHand.map(cardString).join('  ')} ` +
      `(**${playerTotal}**)\n\n` +

      `**Dealer: ${session.dealerUser.username}**\n` +
      `${session.dealerHand.map(cardString).join('  ')} ` +
      `(**${dealerTotal}**)\n\n` +

      `${resultText}\n\n` +

      `**${session.playerUser.username}'s Balance:** ` +
      `${money(session.client, session.client.economy.getBalance(
        session.guild.id,
        session.playerUser.id
      ))}\n` +

      `**${session.dealerUser.username}'s Balance:** ` +
      `${money(session.client, newBalance)}`,

    thumbnail: session.playerUser.displayAvatarURL({
      size: 256,
    }),

    footer: 'Blackjack challenge finished',
  });
}

// ============================================================
// 1V1 FINALIZATION
// ============================================================

async function finalizeDuelGame(session) {
  if (session.ended) return;

  session.ended = true;
  session.status = 'finished';

  session.collector?.stop('game_finished');

  try {
    const playerNatural = isNaturalBlackjack(
      session.playerHand
    );

    const dealerNatural = isNaturalBlackjack(
      session.dealerHand
    );

    const playerTotal = handValue(session.playerHand);

    let outcome = 'push';
    let winner = null;

    if (playerTotal > 21) {
      outcome = 'dealer_win';
      winner = 'dealer';

    } else if (playerNatural && dealerNatural) {
      outcome = 'push';

    } else if (playerNatural) {
      outcome = 'player_win';
      winner = 'player';

    } else if (dealerNatural) {
      outcome = 'dealer_win';
      winner = 'dealer';

    } else {
      // Dealer follows standard blackjack rules.
      while (handValue(session.dealerHand) < 17) {
        session.dealerHand.push(
          drawCard(session.deck)
        );
      }

      const dealerTotal = handValue(
        session.dealerHand
      );

      if (dealerTotal > 21 || playerTotal > dealerTotal) {
        outcome = 'player_win';
        winner = 'player';

      } else if (playerTotal === dealerTotal) {
        outcome = 'push';

      } else {
        outcome = 'dealer_win';
        winner = 'dealer';
      }
    }

    let payout = 0;

    // --------------------------------------------------------
    // PLAYER WINS
    // --------------------------------------------------------

    if (winner === 'player') {
      const baseProfit = playerNatural
        ? Math.floor(session.bet * 1.5)
        : session.bet;

      const profit = Math.max(
        0,
        Math.floor(
          Number(
            boostProfit(
              session.client,
              session.guild.id,
              session.playerUser.id,
              baseProfit
            )
          ) || 0
        )
      );

      payout = session.bet + profit;

      session.client.economy.addCrowns(
        session.guild.id,
        session.playerUser.id,
        payout,
        {
          type: 'blackjack_1v1_win',
          reason: playerNatural
            ? 'Blackjack challenge natural win'
            : 'Blackjack challenge win',
          actorId: session.playerUser.id,
        }
      );
    }

    // --------------------------------------------------------
    // DEALER WINS
    // --------------------------------------------------------

    if (winner === 'dealer') {
      const profit = Math.max(
        0,
        Math.floor(
          Number(
            boostProfit(
              session.client,
              session.guild.id,
              session.dealerUser.id,
              session.bet
            )
          ) || 0
        )
      );

      payout = session.bet + profit;

      session.client.economy.addCrowns(
        session.guild.id,
        session.dealerUser.id,
        payout,
        {
          type: 'blackjack_1v1_dealer_win',
          reason: 'Blackjack challenge dealer win',
          actorId: session.dealerUser.id,
        }
      );
    }

    // --------------------------------------------------------
    // PUSH
    // --------------------------------------------------------

    if (outcome === 'push') {
      session.client.economy.addCrowns(
        session.guild.id,
        session.playerUser.id,
        session.bet,
        {
          type: 'blackjack_1v1_push',
          reason: 'Blackjack challenge tie refund',
          actorId: session.playerUser.id,
        }
      );

      session.client.economy.addCrowns(
        session.guild.id,
        session.dealerUser.id,
        session.bet,
        {
          type: 'blackjack_1v1_push',
          reason: 'Blackjack challenge tie refund',
          actorId: session.dealerUser.id,
        }
      );
    }

    // --------------------------------------------------------
    // CLAN TRACKING
    // --------------------------------------------------------

    const playerResult = outcome === 'player_win'
      ? true
      : outcome === 'dealer_win'
        ? false
        : null;

    const dealerResult = outcome === 'dealer_win'
      ? true
      : outcome === 'player_win'
        ? false
        : null;

    await Promise.all([
      trackClanGame(
        session.client,
        {
          guild: session.guild,
          channel: session.channel,
          author: session.playerUser,
        },
        'blackjack',
        playerResult
      ),

      trackClanGame(
        session.client,
        {
          guild: session.guild,
          channel: session.channel,
          author: session.dealerUser,
        },
        'blackjack',
        dealerResult
      ),
    ]);

    const dealerBalance = session.client.economy.getBalance(
      session.guild.id,
      session.dealerUser.id
    );

    const embed = renderDuelResultEmbed(
      session,
      outcome,
      payout,
      dealerBalance
    );

    await session.message?.edit({
      embeds: [embed],
      components: [
        duelPlayerRow(session, true),
      ],
    }).catch(error => {
      console.error(
        '[Blackjack 1v1] Result edit failed:',
        error?.message || error
      );
    });

  } catch (error) {
    console.error(
      '[Blackjack 1v1] Settlement failed:',
      error
    );

    await session.message?.edit({
      embeds: [
        buildEmbed(session.messageRef, {
          title: 'Blackjack | 1v1',
          description:
            'There was an error settling this game. ' +
            'Please contact an administrator and check both balances.',
        }),
      ],
      components: [
        duelPlayerRow(session, true),
      ],
    }).catch(() => {});

  } finally {
    releaseSessionLocks(session);
  }
}

// ============================================================
// START 1V1 GAME COLLECTOR
// ============================================================

async function startDuelGame(session) {
  const prefix = `bjduel_${session.token}`;

  const collector = session.message.createMessageComponentCollector({
    time: TURN_TIMEOUT_MS,

    filter: interaction =>
      interaction.customId === `${prefix}_hit` ||
      interaction.customId === `${prefix}_stand`,
  });

  session.collector = collector;

  collector.on('collect', async interaction => {
    if (session.ended) return;

    // Only the challenger controls the player hand.
    if (interaction.user.id !== session.playerUser.id) {
      return interaction.reply({
        content: 'Only the player can use these blackjack controls.',
        ephemeral: true,
      }).catch(() => {});
    }

    if (session.processing) {
      return interaction.reply({
        content: 'Your previous action is still processing.',
        ephemeral: true,
      }).catch(() => {});
    }

    session.processing = true;

    try {
      await interaction.deferUpdate().catch(() => {});

      if (session.ended) return;

      if (interaction.customId === `${prefix}_hit`) {
        // No owner advantage in 1v1.
        session.playerHand.push(
          drawCard(session.deck)
        );

        const total = handValue(session.playerHand);

        if (total >= 21) {
          await finalizeDuelGame(session);
          return;
        }

        await session.message.edit({
          embeds: [
            renderDuelEmbed(session),
          ],
          components: [
            duelPlayerRow(session),
          ],
        }).catch(() => {});

        collector.resetTimer({
          time: TURN_TIMEOUT_MS,
        });

      } else if (
        interaction.customId === `${prefix}_stand`
      ) {
        await finalizeDuelGame(session);
      }

    } catch (error) {
      console.error(
        '[Blackjack 1v1] Player action failed:',
        error
      );

      await finalizeDuelGame(session);

    } finally {
      session.processing = false;
    }
  });

  collector.on('end', async () => {
    if (!session.ended) {
      // Timeout automatically stands.
      await finalizeDuelGame(session);
    }
  });

  await session.message.edit({
    embeds: [
      renderDuelEmbed(session),
    ],
    components: [
      duelPlayerRow(session),
    ],
  });
}

// ============================================================
// ACCEPTED CHALLENGE
// ============================================================

async function acceptChallenge(session) {
  const guildId = session.guild.id;
  const playerId = session.playerUser.id;
  const dealerId = session.dealerUser.id;

  let playerStakeTaken = false;
  let dealerStakeTaken = false;

  try {
    const playerBalance = session.client.economy.getBalance(
      guildId,
      playerId
    );

    const dealerBalance = session.client.economy.getBalance(
      guildId,
      dealerId
    );

    if (playerBalance < session.bet) {
      await cancelPendingChallenge(
        session,
        'cancelled'
      );
      return;
    }

    if (dealerBalance < session.bet) {
      await cancelPendingChallenge(
        session,
        'cancelled'
      );
      return;
    }

    // Collect the challenger's stake.
    const playerRemoved = session.client.economy.removeCrowns(
      guildId,
      playerId,
      session.bet,
      {
        type: 'blackjack_1v1_bet',
        reason: 'Blackjack challenge player bet',
        actorId: playerId,
      }
    );

    if (!playerRemoved) {
      await cancelPendingChallenge(
        session,
        'cancelled'
      );
      return;
    }

    playerStakeTaken = true;

    // Collect the dealer-side stake.
    const dealerRemoved = session.client.economy.removeCrowns(
      guildId,
      dealerId,
      session.bet,
      {
        type: 'blackjack_1v1_bet',
        reason: 'Blackjack challenge dealer bet',
        actorId: dealerId,
      }
    );

    if (!dealerRemoved) {
      session.client.economy.addCrowns(
        guildId,
        playerId,
        session.bet,
        {
          type: 'blackjack_1v1_refund',
          reason: 'Dealer stake could not be collected',
          actorId: playerId,
        }
      );

      playerStakeTaken = false;

      await cancelPendingChallenge(
        session,
        'cancelled'
      );

      return;
    }

    dealerStakeTaken = true;

    // --------------------------------------------------------
    // BOTH BETS COLLECTED
    // --------------------------------------------------------

    session.status = 'playing';
    session.ended = false;

    session.deck = createDeck();

    session.playerHand = [
      drawCard(session.deck),
      drawCard(session.deck),
    ];

    session.dealerHand = [
      drawCard(session.deck),
      drawCard(session.deck),
    ];

    // Stop the invitation collector.
    session.inviteCollector?.stop('accepted');

    // No owner advantage in this game.
    // Both hands use normal deck draws.

    await startDuelGame(session);

    // Natural blackjack is resolved immediately.
    if (
      isNaturalBlackjack(session.playerHand) ||
      isNaturalBlackjack(session.dealerHand)
    ) {
      await finalizeDuelGame(session);
    }

  } catch (error) {
    console.error(
      '[Blackjack 1v1] Challenge acceptance failed:',
      error
    );

    // Refund any stakes collected before the failure.
    if (playerStakeTaken) {
      session.client.economy.addCrowns(
        guildId,
        playerId,
        session.bet,
        {
          type: 'blackjack_1v1_refund',
          reason: 'Blackjack challenge failed to start',
          actorId: playerId,
        }
      );
    }

    if (dealerStakeTaken) {
      session.client.economy.addCrowns(
        guildId,
        dealerId,
        session.bet,
        {
          type: 'blackjack_1v1_refund',
          reason: 'Blackjack challenge failed to start',
          actorId: dealerId,
        }
      );
    }

    session.status = 'cancelled';
    session.ended = true;

    session.inviteCollector?.stop('cancelled');
    session.collector?.stop('cancelled');

    await session.message?.edit({
      embeds: [
        renderChallengeEmbed(session, 'cancelled'),
      ],
      components: [],
    }).catch(() => {});

    releaseSessionLocks(session);
  }
}

// ============================================================
// CHALLENGE INVITATION COLLECTOR
// ============================================================

function startChallengeCollector(session) {
  const prefix = `bjchallenge_${session.token}`;

  const acceptId = `${prefix}_accept`;
  const rejectId = `${prefix}_reject`;

  const collector = session.message.createMessageComponentCollector({
    time: CHALLENGE_TIMEOUT_MS,

    filter: interaction =>
      interaction.customId === acceptId ||
      interaction.customId === rejectId,
  });

  session.inviteCollector = collector;

  collector.on('collect', async interaction => {
    if (session.status !== 'pending') return;

    // Only the invited user may accept or reject.
    if (interaction.user.id !== session.dealerUser.id) {
      return interaction.reply({
        content: 'This blackjack challenge was not sent to you.',
        ephemeral: true,
      }).catch(() => {});
    }

    if (session.processing) {
      return interaction.reply({
        content: 'This challenge is already being processed.',
        ephemeral: true,
      }).catch(() => {});
    }

    session.processing = true;

    try {
      await interaction.deferUpdate().catch(() => {});

      if (interaction.customId === rejectId) {
        await cancelPendingChallenge(
          session,
          'declined'
        );

        return;
      }

      if (interaction.customId === acceptId) {
        await acceptChallenge(session);
      }

    } catch (error) {
      console.error(
        '[Blackjack] Invitation action failed:',
        error
      );

      await cancelPendingChallenge(
        session,
        'cancelled'
      );

    } finally {
      session.processing = false;
    }
  });

  collector.on('end', async () => {
    if (session.status === 'pending') {
      await cancelPendingChallenge(
        session,
        'expired'
      );
    }
  });
}

// ============================================================
// COMMAND
// ============================================================

module.exports = {
  name: 'blackjack',
  aliases: ['bj', '21'],
  description: 'Play blackjack against the dealer or challenge another player.',
  category: 'economy',
  usage: '$bj <amount> [@user/user ID]',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !client.economy ||
      typeof client.economy.getBalance !== 'function' ||
      typeof client.economy.removeCrowns !== 'function' ||
      typeof client.economy.addCrowns !== 'function'
    ) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Economy Unavailable',
            description: 'The economy system is not ready.',
          }),
        ],
        allowedMentions: {
          repliedUser: false,
        },
      });
    }

    // --------------------------------------------------------
    // BET VALIDATION
    // --------------------------------------------------------

    const betText = String(args[0] ?? '').trim();

    if (!/^\d+$/.test(betText)) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Blackjack',
            description:
              'Use: `$bj <amount>` for solo blackjack.\n' +
              'Use: `$bj <amount> @user` to challenge someone.',
          }),
        ],
        allowedMentions: {
          repliedUser: false,
        },
      });
    }

    const bet = Number(betText);

    if (!Number.isSafeInteger(bet) || bet <= 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Blackjack',
            description: 'Enter a valid positive whole-number bet.',
          }),
        ],
        allowedMentions: {
          repliedUser: false,
        },
      });
    }

    if (bet > MAX_BET) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Blackjack',
            description:
              `Maximum bet is **${money(client, MAX_BET)}**.`,
          }),
        ],
        allowedMentions: {
          repliedUser: false,
        },
      });
    }

    // --------------------------------------------------------
    // OPTIONAL OPPONENT
    // --------------------------------------------------------

    const duelRequested = Boolean(
      args[1] || message.mentions?.users?.size
    );

    let opponentMember = null;

    if (duelRequested) {
      const resolved = await resolveOpponent(
        message,
        args[1]
      );

      if (resolved.error) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Blackjack Challenge',
              description: resolved.error,
            }),
          ],
          allowedMentions: {
            repliedUser: false,
          },
        });
      }

      opponentMember = resolved.member;
    }

    // --------------------------------------------------------
    // SHARED GAMBLING LOCK
    // --------------------------------------------------------

    const guildId = message.guild.id;
    const userId = message.author.id;

    const lockUserIds = opponentMember
      ? [userId, opponentMember.id]
      : [userId];

    const acquired = acquireGamblingLocks(
      guildId,
      lockUserIds,
      'blackjack'
    );

    if (!acquired) {
      return replyGamblingBusy(message);
    }

    let lockTransferredToSession = false;
    let challengerBetTaken = false;

    try {
      // ------------------------------------------------------
      // COOLDOWN
      // ------------------------------------------------------

      const remaining = useCooldown(
        guildId,
        userId,
        'blackjack',
        COOLDOWN_MS
      );

      if (remaining > 0) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Blackjack',
              description:
                `You are on cooldown for **${formatDuration(remaining)}**.`,
            }),
          ],
          allowedMentions: {
            repliedUser: false,
          },
        });
      }

      // ------------------------------------------------------
      // CHALLENGER BALANCE
      // ------------------------------------------------------

      const challengerBalance = client.economy.getBalance(
        guildId,
        userId
      );

      if (challengerBalance < bet) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Blackjack',
              description:
                `You only have **${money(client, challengerBalance)}**.`,
            }),
          ],
          allowedMentions: {
            repliedUser: false,
          },
        });
      }

      // ------------------------------------------------------
      // 1V1 CHALLENGE MODE
      // ------------------------------------------------------

      if (opponentMember) {
        const opponentBalance = client.economy.getBalance(
          guildId,
          opponentMember.id
        );

        if (opponentBalance < bet) {
          return message.reply({
            embeds: [
              buildEmbed(message, {
                title: 'Blackjack Challenge',
                description:
                  `${opponentMember.user.username} does not have enough Crowns for this bet.`,
              }),
            ],
            allowedMentions: {
              repliedUser: false,
            },
          });
        }

        const session = {
          client,
          guild: message.guild,
          channel: message.channel,

          message: null,
          messageRef: message,

          token: randomBytes(8).toString('hex'),

          playerUser: message.author,
          dealerUser: opponentMember.user,

          bet,
          lockUserIds: [...lockUserIds],

          status: 'pending',
          ended: false,
          processing: false,

          collector: null,
          inviteCollector: null,

          locksReleased: false,
        };

        // Send challenge invitation.
        session.message = await message.reply({
          content:
            `<@${opponentMember.id}>, you have received a Blackjack challenge.`,

          embeds: [
            renderChallengeEmbed(session),
          ],

          components: [
            challengeRow(session),
          ],

          allowedMentions: {
            users: [opponentMember.id],
            repliedUser: false,
          },
        });

        // Start invitation collector.
        startChallengeCollector(session);

        // The invitation now owns both locks.
        activeGames.set(
          gameKey(guildId, userId),
          session
        );

        activeGames.set(
          gameKey(guildId, opponentMember.id),
          session
        );

        lockTransferredToSession = true;

        return;
      }

      // ------------------------------------------------------
      // SOLO MODE
      // ------------------------------------------------------

      // Owner advantage is SOLO ONLY.
      const ownerAdvantage = await isBotOwner(
        client,
        userId
      );

      const removed = client.economy.removeCrowns(
        guildId,
        userId,
        bet,
        {
          type: 'blackjack_bet',
          reason: 'Blackjack bet',
          actorId: userId,
        }
      );

      if (!removed) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Blackjack',
              description: 'You do not have enough Crowns.',
            }),
          ],
          allowedMentions: {
            repliedUser: false,
          },
        });
      }

      challengerBetTaken = true;

      const deck = createDeck();

      const session = {
        client,
        guild: message.guild,
        channel: message.channel,

        message: null,
        messageRef: message,

        user: message.author,
        bet,
        deck,

        ownerAdvantage,

        playerHand: [],
        dealerHand: [
          drawCard(deck),
          drawCard(deck),
        ],

        ended: false,
        processing: false,

        collector: null,

        lockUserIds: [userId],
        locksReleased: false,
      };

      // Initial player cards.
      session.playerHand.push(
        drawSoloPlayerCard(session)
      );

      session.playerHand.push(
        drawSoloPlayerCard(session)
      );

      activeGames.set(
        gameKey(guildId, userId),
        session
      );

      lockTransferredToSession = true;

      try {
        session.message = await message.reply({
          embeds: [
            renderSoloEmbed(
              session,
              false,
              'Your move'
            ),
          ],

          components: [
            activeRow(),
          ],

          allowedMentions: {
            repliedUser: false,
          },
        });

      } catch (error) {
        console.error(
          '[Blackjack] Could not send game message:',
          error?.message || error
        );

        client.economy.addCrowns(
          guildId,
          userId,
          bet,
          {
            type: 'blackjack_refund',
            reason: 'Blackjack failed to start',
            actorId: userId,
          }
        );

        challengerBetTaken = false;

        releaseSessionLocks(session);

        return;
      }

      // Resolve natural blackjack immediately.
      if (
        isNaturalBlackjack(session.playerHand) ||
        isNaturalBlackjack(session.dealerHand)
      ) {
        await finalizeSoloGame(session);
        return;
      }

      startSoloCollector(session);

    } catch (error) {
      console.error(
        '[Blackjack] Command failed:',
        error
      );

      // Refund a bet if it was taken but the session
      // was never successfully handed over.
      if (
        !lockTransferredToSession &&
        challengerBetTaken
      ) {
        client.economy.addCrowns(
          guildId,
          userId,
          bet,
          {
            type: 'blackjack_refund',
            reason: 'Blackjack command failed before game start',
            actorId: userId,
          }
        );

        challengerBetTaken = false;
      }

      return message.reply({
        content:
          'Blackjack could not be started. Please try again.',

        allowedMentions: {
          repliedUser: false,
        },
      }).catch(() => null);

    } finally {
      if (!lockTransferredToSession) {
        releaseGamblingLocks(
          guildId,
          lockUserIds,
          'blackjack'
        );
      }
    }
  },
};