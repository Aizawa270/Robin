'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { randomBytes } = require('crypto');

const {
  formatDuration,
  useCooldown,
  boostProfit,
  acquireGamblingLocks,
  releaseGamblingLocks,
  GAMBLING_BUSY_MESSAGE,
} = require('../../handlers/gamblingHelpers');

const MAX_BET = 25_000;
const COOLDOWN_MS = 10_000;
const TURN_TIMEOUT_MS = 120_000;

// One active blackjack session per player.
const activeGames = new Map();

function gameKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

async function trackClanGame(client, message, game, result) {
  try {
    const tracker = client?.clanSystem?.trackGame;
    if (typeof tracker === 'function') {
      await tracker(message, game, result);
    }
  } catch (error) {
    console.error(`[${game}] Clan quest tracking failed:`, error);
  }
}

function releaseSessionLocks(session) {
  if (!session || session.locksReleased) return;
  session.locksReleased = true;

  const userIds = session.lockUserIds || [];
  for (const userId of userIds) {
    activeGames.delete(gameKey(session.guild.id, userId));
  }

  releaseGamblingLocks(session.guild.id, userIds, 'blackjack');
}

function buildEmbed(message, data = {}) {
  if (typeof message?.createEmbed === 'function') {
    const embed = message.createEmbed({
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      footer: data.footer,
    });

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
// CARDS
// ============================================================

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) deck.push({ rank, suit });
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function drawCard(deck) {
  if (!deck.length) throw new Error('The blackjack deck is empty.');
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
  return hand.length === 2 && handValue(hand) === 21;
}

// ============================================================
// SOLO BLACKJACK
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

function renderSoloEmbed(session, revealDealer = false, status = 'Your move') {
  const playerCards = session.playerHand.map(cardString).join('  ');
  const dealerCards = revealDealer
    ? session.dealerHand.map(cardString).join('  ')
    : `${cardString(session.dealerHand[0])}  Hidden`;

  const playerTotal = handValue(session.playerHand);
  const dealerTotal = revealDealer
    ? handValue(session.dealerHand)
    : 'Hidden';

  return buildEmbed(session.messageRef, {
    title: '🃏 Blackjack',
    description:
      `**Bet:** ${money(session.client, session.bet)}\n\n` +
      `**Your Hand:**\n${playerCards || '—'}\n` +
      `**Total:** ${playerTotal}\n\n` +
      `**Dealer Hand:**\n${dealerCards || '—'}\n` +
      `**Total:** ${dealerTotal}\n\n` +
      `**Status:** ${status}`,
    thumbnail: session.user.displayAvatarURL({ size: 256 }),
    footer: `Requested by ${session.user.username}`,
  });
}

async function finalizeSoloGame(session, messageLike = null, reason = 'stand') {
  if (session.ended) return;
  session.ended = true;
  session.collector?.stop('game_finished');

  try {
    let outcome = 'push';
    let payout = 0;
    const playerTotal = handValue(session.playerHand);

    if (playerTotal > 21) {
      outcome = 'loss';
    } else {
      while (handValue(session.dealerHand) < 17) {
        session.dealerHand.push(drawCard(session.deck));
      }

      const dealerTotal = handValue(session.dealerHand);

      if (dealerTotal > 21 || playerTotal > dealerTotal) {
        outcome = 'win';
        const baseProfit = reason === 'natural'
          ? Math.round(session.bet * 1.5)
          : session.bet;
        const profit = boostProfit(
          session.client,
          session.guild.id,
          session.user.id,
          baseProfit
        );
        payout = session.bet + profit;

        session.client.economy.addCrowns(
          session.guild.id,
          session.user.id,
          payout,
          {
            type: 'blackjack_win',
            reason: reason === 'natural' ? 'Natural blackjack' : 'Blackjack win',
            actorId: session.user.id,
          }
        );
      } else if (playerTotal === dealerTotal) {
        outcome = 'push';
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
      } else {
        outcome = 'loss';
      }
    }

    const clanResult = outcome === 'win'
      ? true
      : outcome === 'loss'
        ? false
        : null;

    await trackClanGame(
      session.client,
      session.messageRef,
      'blackjack',
      clanResult
    );

    const profit = outcome === 'win' ? payout - session.bet : 0;
    const resultText = outcome === 'win'
      ? `### ✅ You Won!\nYou earned **${money(session.client, profit)}**.`
      : outcome === 'push'
        ? '### 🤝 Push!\nYour bet has been refunded.'
        : `### ❌ You Lost!\nYou lost **${money(session.client, session.bet)}**.`;

    const embed = buildEmbed(
      session.messageRef || messageLike || session.message,
      {
        title: '🃏 Blackjack',
        description:
          `**Bet:** ${money(session.client, session.bet)}\n\n` +
          `**Your Hand:**\n${session.playerHand.map(cardString).join('  ')} (**${handValue(session.playerHand)}**)\n\n` +
          `**Dealer Hand:**\n${session.dealerHand.map(cardString).join('  ')} (**${handValue(session.dealerHand)}**)\n\n` +
          resultText,
        thumbnail: session.user.displayAvatarURL({ size: 256 }),
        footer: `Requested by ${session.user.username}`,
      }
    );

    await session.message?.edit({
      embeds: [embed],
      components: [disabledSoloRow()],
    }).catch(() => {});
  } catch (error) {
    console.error('[Blackjack] Settlement failed:', error);
    await session.message?.edit({
      embeds: [buildEmbed(session.messageRef, {
        title: 'Blackjack',
        description: 'The game ended, but the result could not be displayed. Please contact an administrator if your balance looks incorrect.',
      })],
      components: [disabledSoloRow()],
    }).catch(() => {});
  } finally {
    releaseSessionLocks(session);
  }
}

// ============================================================
// 1V1 BLACKJACK
// ============================================================

async function resolveOpponent(message, raw) {
  const mentionedMember = message.mentions?.members?.first?.();
  if (mentionedMember) {
    if (mentionedMember.id === message.author.id) {
      return { error: 'You cannot challenge yourself.' };
    }
    if (mentionedMember.user.bot) {
      return { error: 'You cannot challenge a bot.' };
    }
    return { member: mentionedMember };
  }

  const mentionedUser = message.mentions?.users?.first?.();
  let id = mentionedUser?.id || null;

  if (!id) {
    const text = String(raw || '').trim();
    const match = text.match(/^<@!?(\d+)>$/) || text.match(/^(\d{16,22})$/);
    id = match?.[1] || null;
  }

  if (!id) {
    return { error: 'Mention a server member or provide their user ID.' };
  }
  if (id === message.author.id) {
    return { error: 'You cannot challenge yourself.' };
  }

  const member = message.guild.members.cache.get(id) ||
    await message.guild.members.fetch(id).catch(() => null);

  if (!member) {
    return { error: 'That user is not a member of this server.' };
  }
  if (member.user.bot) {
    return { error: 'You cannot challenge a bot.' };
  }

  return { member };
}

function duelButtonRow(session, disabled = false) {
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

function renderDuelEmbed(session) {
  const current = session.players[session.turnIndex];

  const playerSections = session.players.map(player => {
    const total = handValue(player.hand);
    const state = total > 21
      ? 'BUST'
      : player.stood
        ? 'STAND'
        : 'PLAYING';
    const isTurn = current?.user.id === player.user.id;
    const cards = player.hand.map(cardString).join('  ');

    return (
      `**${player.user.username}**${isTurn ? ' ← Current turn' : ''}\n` +
      `${cards}\n` +
      `Total: **${total}** • ${state}`
    );
  });

  return buildEmbed(session.messageRef, {
    title: '🃏 Blackjack • 1v1',
    description:
      `**Stake per player:** ${money(session.client, session.bet)}\n` +
      `**Total pot:** ${money(session.client, session.bet * 2)}\n\n` +
      'Highest hand at or below **21** wins. Busting loses. A tie refunds both bets.\n\n' +
      playerSections.join('\n\n') +
      `\n\n**Turn:** ${current?.user.username || 'Finishing game'}`,
    thumbnail: session.players[0].user.displayAvatarURL({ size: 256 }),
    footer: 'Blackjack 1v1',
  });
}

async function finalizeDuelGame(session) {
  if (session.ended) return;
  session.ended = true;
  session.collector?.stop('game_finished');

  try {
    const validPlayers = session.players.filter(
      player => handValue(player.hand) <= 21
    );

    let winner = null;
    let tied = false;

    if (validPlayers.length === 1) {
      winner = validPlayers[0];
    } else if (validPlayers.length === 2) {
      const first = validPlayers[0];
      const second = validPlayers[1];
      const firstTotal = handValue(first.hand);
      const secondTotal = handValue(second.hand);

      if (firstTotal > secondTotal) winner = first;
      else if (secondTotal > firstTotal) winner = second;
      else {
        const firstNatural = isNaturalBlackjack(first.hand);
        const secondNatural = isNaturalBlackjack(second.hand);
        if (firstNatural && !secondNatural) winner = first;
        else if (secondNatural && !firstNatural) winner = second;
        else tied = true;
      }
    }

    let resultText;

    if (winner) {
      // Winner receives their own stake plus the opponent's stake.
      // Their current boost applies to the opponent's stake only.
      const boostedOpponentStake = boostProfit(
        session.client,
        session.guild.id,
        winner.user.id,
        session.bet
      );
      const payout = session.bet + boostedOpponentStake;

      session.client.economy.addCrowns(
        session.guild.id,
        winner.user.id,
        payout,
        {
          type: 'blackjack_1v1_win',
          reason: 'Blackjack 1v1 winnings',
          actorId: winner.user.id,
        }
      );

      resultText =
        `### 🏆 ${winner.user.username} wins!\n` +
        `They receive **${money(session.client, payout)}**.`;
    } else if (tied) {
      for (const player of session.players) {
        session.client.economy.addCrowns(
          session.guild.id,
          player.user.id,
          session.bet,
          {
            type: 'blackjack_1v1_push',
            reason: 'Blackjack 1v1 tie refund',
            actorId: player.user.id,
          }
        );
      }
      resultText = '### 🤝 It\'s a tie!\nBoth bets have been refunded.';
    } else {
      resultText = '### Both players busted!\nNeither player wins. Both bets are lost.';
    }

    await Promise.all(session.players.map(player => {
      const playerResult = winner
        ? player.user.id === winner.user.id
        : tied
          ? null
          : false;

      // trackGame uses guild, channel and author; this lightweight
      // message-shaped object supplies those fields for each duelist.
      const trackingMessage = {
        guild: session.guild,
        channel: session.channel,
        author: player.user,
      };

      return trackClanGame(
        session.client,
        trackingMessage,
        'blackjack',
        playerResult
      );
    }));

    const hands = session.players.map(player =>
      `**${player.user.username}:** ${player.hand.map(cardString).join('  ')} (**${handValue(player.hand)}**)`
    );

    const embed = buildEmbed(session.messageRef, {
      title: '🃏 Blackjack • 1v1 Result',
      description:
        `**Stake per player:** ${money(session.client, session.bet)}\n\n` +
        hands.join('\n') +
        `\n\n${resultText}`,
      thumbnail: session.players[0].user.displayAvatarURL({ size: 256 }),
      footer: 'Blackjack 1v1 finished',
    });

    await session.message?.edit({
      embeds: [embed],
      components: [duelButtonRow(session, true)],
    }).catch(error => {
      console.error('[Blackjack 1v1] Result message edit failed:', error?.message || error);
    });
  } catch (error) {
    console.error('[Blackjack 1v1] Settlement failed:', error);
    await session.message?.edit({
      embeds: [buildEmbed(session.messageRef, {
        title: 'Blackjack • 1v1',
        description: 'There was an error settling this game. Please contact an administrator and check both balances.',
      })],
      components: [duelButtonRow(session, true)],
    }).catch(() => {});
  } finally {
    releaseSessionLocks(session);
  }
}

async function startDuelTurn(session) {
  if (session.ended) return;

  const nextIndex = session.players.findIndex(player => !player.stood);
  if (nextIndex === -1) {
    return finalizeDuelGame(session);
  }

  session.turnIndex = nextIndex;

  await session.message.edit({
    embeds: [renderDuelEmbed(session)],
    components: [duelButtonRow(session)],
  }).catch(error => {
    console.error('[Blackjack 1v1] Turn display failed:', error?.message || error);
  });

  if (session.ended) return;

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

    const player = session.players.find(
      entry => entry.user.id === interaction.user.id
    );
    if (!player) {
      return interaction.reply({
        content: 'You are not part of this blackjack game.',
        ephemeral: true,
      }).catch(() => {});
    }

    const current = session.players[session.turnIndex];
    if (player.user.id !== current.user.id) {
      return interaction.reply({
        content: `It is ${current.user.username}'s turn.`,
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
        current.hand.push(drawCard(session.deck));
        if (handValue(current.hand) >= 21) current.stood = true;
      } else {
        current.stood = true;
      }

      if (current.stood) {
        // The collector's end handler starts the next player's turn.
        collector.stop('turn_complete');
        return;
      }

      await session.message.edit({
        embeds: [renderDuelEmbed(session)],
        components: [duelButtonRow(session)],
      }).catch(() => {});

      collector.resetTimer({ time: TURN_TIMEOUT_MS });
    } catch (error) {
      console.error('[Blackjack 1v1] Turn action failed:', error);
    } finally {
      session.processing = false;
    }
  });

  collector.on('end', async (_collected, reason) => {
    if (session.ended || reason === 'game_finished') return;

    if (reason === 'time') {
      // An inactive player automatically stands when their turn expires.
      const current = session.players[session.turnIndex];
      if (current) current.stood = true;
    }

    if (reason === 'turn_complete' || reason === 'time') {
      await startDuelTurn(session).catch(error => {
        console.error('[Blackjack 1v1] Next turn failed:', error);
        finalizeDuelGame(session).catch(() => {});
      });
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

    if (!client.economy) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Economy Unavailable',
          description: 'The economy system is not ready.',
        })],
      });
    }

    const betText = String(args[0] ?? '').trim();
    if (!/^\d+$/.test(betText)) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Blackjack',
          description:
            'Use: `$bj <amount>` for solo blackjack.\n' +
            'Use: `$bj <amount> @user` for 1v1 blackjack.',
        })],
      });
    }

    const bet = Number(betText);
    if (!Number.isSafeInteger(bet) || bet <= 0) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Blackjack',
          description: 'Enter a valid positive whole-number bet.',
        })],
      });
    }

    if (bet > MAX_BET) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Blackjack',
          description: `Maximum bet is **${money(client, MAX_BET)}**.`,
        })],
      });
    }

    const duelRequested = Boolean(args[1] || message.mentions?.users?.size);
    let opponentMember = null;

    if (duelRequested) {
      const resolved = await resolveOpponent(message, args[1]);
      if (resolved.error) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Blackjack 1v1',
            description: resolved.error,
          })],
        });
      }
      opponentMember = resolved.member;
    }

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
      return message.reply({
        content: GAMBLING_BUSY_MESSAGE,
        allowedMentions: { repliedUser: false },
      });
    }

    let lockTransferredToSession = false;
    let challengerBetTaken = false;
    let opponentBetTaken = false;

    try {
      const remaining = useCooldown(
        guildId,
        userId,
        'blackjack',
        COOLDOWN_MS
      );

      if (remaining > 0) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Blackjack',
            description: `You are on cooldown for **${formatDuration(remaining)}**.`,
          })],
        });
      }

      const challengerBalance = client.economy.getBalance(guildId, userId);
      if (challengerBalance < bet) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Blackjack',
            description: `You only have **${money(client, challengerBalance)}**.`,
          })],
        });
      }

      if (opponentMember) {
        const opponentBalance = client.economy.getBalance(guildId, opponentMember.id);
        if (opponentBalance < bet) {
          return message.reply({
            embeds: [buildEmbed(message, {
              title: 'Blackjack 1v1',
              description: `${opponentMember.user.username} does not have enough Crowns for this bet.`,
            })],
          });
        }
      }

      const removed = client.economy.removeCrowns(
        guildId,
        userId,
        bet,
        {
          type: 'blackjack_bet',
          reason: opponentMember ? 'Blackjack 1v1 bet' : 'Blackjack bet',
          actorId: userId,
        }
      );

      if (!removed) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Blackjack',
            description: 'You do not have enough Crowns.',
          })],
        });
      }
      challengerBetTaken = true;

      if (opponentMember) {
        const opponentRemoved = client.economy.removeCrowns(
          guildId,
          opponentMember.id,
          bet,
          {
            type: 'blackjack_1v1_bet',
            reason: 'Blackjack 1v1 bet',
            actorId: userId,
          }
        );

        if (!opponentRemoved) {
          client.economy.addCrowns(guildId, userId, bet, {
            type: 'blackjack_1v1_refund',
            reason: 'Opponent bet could not be collected',
            actorId: userId,
          });
          challengerBetTaken = false;

          return message.reply({
            embeds: [buildEmbed(message, {
              title: 'Blackjack 1v1',
              description: 'The opponent\'s balance changed before their bet could be collected. Your bet was refunded.',
            })],
          });
        }
        opponentBetTaken = true;

        const deck = createDeck();
        const session = {
          client,
          guild: message.guild,
          channel: message.channel,
          message: null,
          messageRef: message,
          bet,
          deck,
          token: randomBytes(8).toString('hex'),
          players: [
            {
              user: message.author,
              hand: [drawCard(deck), drawCard(deck)],
              stood: false,
            },
            {
              user: opponentMember.user,
              hand: [drawCard(deck), drawCard(deck)],
              stood: false,
            },
          ],
          turnIndex: 0,
          processing: false,
          ended: false,
          collector: null,
          lockUserIds: [...lockUserIds],
          locksReleased: false,
        };

        // A natural blackjack stands automatically.
        for (const player of session.players) {
          if (isNaturalBlackjack(player.hand)) player.stood = true;
        }

        activeGames.set(gameKey(guildId, userId), session);
        activeGames.set(gameKey(guildId, opponentMember.id), session);
        lockTransferredToSession = true;

        try {
          session.message = await message.reply({
            content: `<@${opponentMember.id}> has been challenged to a blackjack 1v1.`,
            embeds: [renderDuelEmbed(session)],
            components: [duelButtonRow(session)],
            allowedMentions: {
              users: [opponentMember.id],
              repliedUser: false,
            },
          });

          await startDuelTurn(session);
        } catch (error) {
          console.error('[Blackjack 1v1] Could not start game:', error);
          session.ended = true;
          session.collector?.stop('game_finished');

          for (const player of session.players) {
            client.economy.addCrowns(guildId, player.user.id, bet, {
              type: 'blackjack_1v1_refund',
              reason: 'Blackjack 1v1 failed to start',
              actorId: userId,
            });
          }

          challengerBetTaken = false;
          opponentBetTaken = false;
          releaseSessionLocks(session);

          return message.reply({
            content: 'The 1v1 game could not be started. Both bets were refunded.',
            allowedMentions: { repliedUser: false },
          }).catch(() => null);
        }

        return;
      }

      // --------------------------- SOLO MODE ---------------------------
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
        playerHand: [drawCard(deck), drawCard(deck)],
        dealerHand: [drawCard(deck), drawCard(deck)],
        ended: false,
        lockUserIds: [userId],
        locksReleased: false,
      };

      activeGames.set(gameKey(guildId, userId), session);
      lockTransferredToSession = true;

      try {
        session.message = await message.reply({
          embeds: [renderSoloEmbed(session, false, 'Your move')],
          components: [activeRow()],
          allowedMentions: { repliedUser: false },
        });
      } catch (error) {
        console.error('[Blackjack] Could not send game message:', error?.message || error);
        client.economy.addCrowns(guildId, userId, bet, {
          type: 'blackjack_refund',
          reason: 'Blackjack failed to start',
          actorId: userId,
        });
        challengerBetTaken = false;
        releaseSessionLocks(session);
        return;
      }

      if (isNaturalBlackjack(session.playerHand) || isNaturalBlackjack(session.dealerHand)) {
        const reason = isNaturalBlackjack(session.playerHand) ? 'natural' : 'stand';
        await finalizeSoloGame(session, session.message, reason);
        return;
      }

      const collector = session.message.createMessageComponentCollector({
        time: TURN_TIMEOUT_MS,
        filter: interaction => ['bj_hit', 'bj_stand'].includes(interaction.customId),
      });
      session.collector = collector;

      collector.on('collect', async interaction => {
        if (interaction.user.id !== userId) {
          return interaction.reply({
            content: 'This is not your blackjack hand.',
            ephemeral: true,
          }).catch(() => {});
        }

        await interaction.deferUpdate().catch(() => {});
        if (session.ended) return;

        if (interaction.customId === 'bj_hit') {
          session.playerHand.push(drawCard(session.deck));
          const total = handValue(session.playerHand);
          if (total >= 21) {
            await finalizeSoloGame(
              session,
              session.message,
              total === 21 ? 'stand' : 'bust'
            );
            return;
          }

          await session.message.edit({
            embeds: [renderSoloEmbed(session, false, 'Your move')],
            components: [activeRow()],
          }).catch(() => {});
        } else if (interaction.customId === 'bj_stand') {
          await finalizeSoloGame(session, session.message, 'stand');
        }
      });

      collector.on('end', async () => {
        if (!session.ended) {
          await finalizeSoloGame(session, session.message, 'stand');
        }
      });
    } catch (error) {
      console.error('[Blackjack] Command failed:', error);

      // Refund any stake still held because a session was not successfully
      // handed over to its game collector.
      if (!lockTransferredToSession && challengerBetTaken) {
        client.economy.addCrowns(guildId, userId, bet, {
          type: 'blackjack_refund',
          reason: 'Blackjack command failed before game start',
          actorId: userId,
        });
        challengerBetTaken = false;
      }

      if (!lockTransferredToSession && opponentBetTaken && opponentMember) {
        client.economy.addCrowns(guildId, opponentMember.id, bet, {
          type: 'blackjack_1v1_refund',
          reason: 'Blackjack command failed before game start',
          actorId: userId,
        });
        opponentBetTaken = false;
      }

      return message.reply({
        content: 'Blackjack could not be started. Please try again.',
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
    } finally {
      if (!lockTransferredToSession) {
        releaseGamblingLocks(guildId, lockUserIds, 'blackjack');
      }
    }
  },
};
