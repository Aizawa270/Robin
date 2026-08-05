const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const {
  formatNumber,
  formatDuration,
  useCooldown,
  boostProfit,
} = require('../../handlers/gamblingHelpers');

const MAX_BET = 50_000;
const COOLDOWN_MS = 60_000;
const activeGames = new Map();

function buildEmbed(data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  return embed;
}

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function drawCard(deck) {
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
      total += parseInt(card.rank, 10);
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

function renderEmbed(session, revealDealer = false, status = 'Your move') {
  const playerHand = session.playerHand.map(cardString).join('  ');
  const dealerHand = revealDealer
    ? session.dealerHand.map(cardString).join('  ')
    : `${cardString(session.dealerHand[0])}  Hidden`;

  const playerTotal = handValue(session.playerHand);
  const dealerTotal = revealDealer ? handValue(session.dealerHand) : handValue([session.dealerHand[0]]);

  return buildEmbed({
    title: 'Blackjack',
    description:
      `Bet\n↳ ${money(session.client, session.bet)}\n\n` +
      `Your Hand\n↳ ${playerHand || '—'}\n` +
      `Total\n↳ ${playerTotal}\n\n` +
      `Dealer\n↳ ${dealerHand || '—'}\n` +
      `Total\n↳ ${revealDealer ? dealerTotal : 'Hidden'}\n\n` +
      `Status\n↳ ${status}`,
    thumbnail: session.user.displayAvatarURL({ size: 256 }),
  });
}

function disabledRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(true),
  );
}

function activeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary),
  );
}

async function finalizeGame(session, messageLike = null, reason = 'stand') {
  if (session.ended) return;
  session.ended = true;
  activeGames.delete(session.channel.id);

  let outcome = 'push';
  let status = 'Tie';
  let payout = 0;

  const playerTotal = handValue(session.playerHand);

  if (playerTotal > 21) {
    outcome = 'loss';
    status = 'Bust';
  } else {
    while (handValue(session.dealerHand) < 17) {
      session.dealerHand.push(drawCard(session.deck));
    }

    const dealerTotal = handValue(session.dealerHand);

    if (dealerTotal > 21 || playerTotal > dealerTotal) {
      outcome = 'win';
      status = reason === 'natural' ? 'Blackjack' : 'Win';

      const baseProfit = reason === 'natural' ? Math.round(session.bet * 1.5) : session.bet;
      const boostedProfit = boostProfit(session.client, session.guild.id, session.user.id, baseProfit);
      payout = session.bet + boostedProfit;

      session.client.economy.addCrowns(session.guild.id, session.user.id, payout, {
        type: 'blackjack_win',
        reason: reason === 'natural' ? 'Natural blackjack' : 'Blackjack win',
        actorId: session.user.id,
      });
    } else if (playerTotal < dealerTotal) {
      outcome = 'loss';
      status = 'Lose';
    } else {
      outcome = 'push';
      status = 'Push';
      payout = session.bet;

      session.client.economy.addCrowns(session.guild.id, session.user.id, payout, {
        type: 'blackjack_push',
        reason: 'Blackjack push refund',
        actorId: session.user.id,
      });
    }
  }

  const finalPlayerTotal = handValue(session.playerHand);
  const finalDealerTotal = handValue(session.dealerHand);

  const embed = buildEmbed({
    title: 'Blackjack',
    description:
      `Bet\n↳ ${money(session.client, session.bet)}\n\n` +
      `Your Hand\n↳ ${session.playerHand.map(cardString).join('  ')}\n` +
      `Total\n↳ ${finalPlayerTotal}\n\n` +
      `Dealer\n↳ ${session.dealerHand.map(cardString).join('  ')}\n` +
      `Total\n↳ ${finalDealerTotal}\n\n` +
      `Result\n↳ ${
        outcome === 'win'
          ? `You won ${money(session.client, payout - session.bet)}`
          : outcome === 'push'
            ? 'Bet refunded'
            : 'You lost'
      }\n\n` +
      `Status\n↳ ${status}`,
    thumbnail: session.user.displayAvatarURL({ size: 256 }),
  });

  const payload = { embeds: [embed], components: [disabledRow()] };

  if (messageLike?.message?.edit) {
    await messageLike.message.edit(payload).catch(() => {});
  } else if (session.message?.edit) {
    await session.message.edit(payload).catch(() => {});
  }
}

module.exports = {
  name: 'blackjack',
  aliases: ['bj', '21'],
  description: 'Play blackjack against the dealer.',
  category: 'economy',
  usage: '$blackjack <amount>',

  async execute(client, message, args) {
    if (!message.guild) return;
    if (!client.economy) {
      return message.reply({
        embeds: [buildEmbed({ title: 'Economy Unavailable', description: 'The economy system is not ready.' })],
      });
    }

    if (activeGames.has(message.channel.id)) {
      return message.reply({
        embeds: [
          buildEmbed({
            title: 'Blackjack',
            description: 'A blackjack game is already running in this channel.',
          }),
        ],
      });
    }

    const bet = parseInt(args[0], 10);
    if (!Number.isInteger(bet) || bet <= 0) {
      return message.reply({
        embeds: [
          buildEmbed({
            title: 'Blackjack',
            description: 'Use: `$blackjack <amount>`',
          }),
        ],
      });
    }

    if (bet > MAX_BET) {
      return message.reply({
        embeds: [
          buildEmbed({
            title: 'Blackjack',
            description: `Maximum bet is **${money(client, MAX_BET)}**.`,
          }),
        ],
      });
    }

    const balance = client.economy.getBalance(message.guild.id, message.author.id);
    if (balance < bet) {
      return message.reply({
        embeds: [
          buildEmbed({
            title: 'Blackjack',
            description: `You only have **${money(client, balance)}**.`,
          }),
        ],
      });
    }

    const remaining = useCooldown(message.guild.id, message.author.id, 'blackjack', COOLDOWN_MS);
    if (remaining > 0) {
      return message.reply({
        embeds: [
          buildEmbed({
            title: 'Blackjack',
            description: `You are on cooldown for **${formatDuration(remaining)}**.`,
          }),
        ],
      });
    }

    const removed = client.economy.removeCrowns(message.guild.id, message.author.id, bet, {
      type: 'blackjack_bet',
      reason: 'Blackjack bet',
      actorId: message.author.id,
    });

    if (!removed) {
      return message.reply({
        embeds: [
          buildEmbed({
            title: 'Blackjack',
            description: 'You do not have enough Crowns.',
          }),
        ],
      });
    }

    const deck = createDeck();
    const session = {
      client,
      guild: message.guild,
      channel: message.channel,
      message: null,
      user: message.author,
      bet,
      deck,
      playerHand: [drawCard(deck), drawCard(deck)],
      dealerHand: [drawCard(deck), drawCard(deck)],
      ended: false,
    };

    activeGames.set(message.channel.id, session);

    session.message = await message.reply({
      embeds: [renderEmbed(session, false, 'Your move')],
      components: [activeRow()],
    });

    if (isNaturalBlackjack(session.playerHand) || isNaturalBlackjack(session.dealerHand)) {
      const reason = isNaturalBlackjack(session.playerHand) ? 'natural' : 'stand';
      await finalizeGame(session, session.message, reason);
      return;
    }

    const collector = session.message.createMessageComponentCollector({
      time: 120_000,
      filter: i => ['bj_hit', 'bj_stand'].includes(i.customId),
    });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== message.author.id) {
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
          await finalizeGame(session, session.message, total === 21 ? 'stand' : 'bust');
          return;
        }

        await session.message.edit({
          embeds: [renderEmbed(session, false, 'Your move')],
          components: [activeRow()],
        }).catch(() => {});
      }

      if (interaction.customId === 'bj_stand') {
        await finalizeGame(session, session.message, 'stand');
      }
    });

    collector.on('end', async () => {
      if (!session.ended) {
        await finalizeGame(session, session.message, 'stand');
      }
    });
  },
};