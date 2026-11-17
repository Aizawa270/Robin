'use strict';

const { EmbedBuilder } = require('discord.js');

const {
  formatDuration,
  useCooldown,
  boostProfit,
  withGamblingLock,
} = require('../../handlers/gamblingHelpers');

const MAX_BET = 25_000;
const COOLDOWN_MS = 10_000;
const ANIMATION_DELAY_MS = 300;

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

function parseChoice(raw) {
  const value = String(raw || '').toLowerCase();
  if (['h', 'head', 'heads'].includes(value)) return 'heads';
  if (['t', 'tail', 'tails'].includes(value)) return 'tails';
  return null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  description: 'Bet on heads or tails.',
  category: 'economy',
  usage: '$coinflip <amount> <h/t>',

  execute: withGamblingLock('coinflip', async function execute(client, message, args) {
    if (!message.guild) return;

    if (!client.economy) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Economy Unavailable',
          description: 'The economy system is not ready.',
        })],
      });
    }

    const amountText = String(args[0] ?? '').trim();
    const amount = /^\d+$/.test(amountText) ? Number(amountText) : NaN;
    const choice = parseChoice(args[1]);

    if (!Number.isSafeInteger(amount) || amount <= 0 || !choice) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Coin Flip',
          description: 'Use: `$coinflip <amount> <h/t>`',
        })],
      });
    }

    if (amount > MAX_BET) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Coin Flip',
          description: `Maximum bet is **${money(client, MAX_BET)}**.`,
        })],
      });
    }

    const guildId = message.guild.id;
    const userId = message.author.id;
    const balance = client.economy.getBalance(guildId, userId);

    if (balance < amount) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Coin Flip',
          description: `You only have **${money(client, balance)}**.`,
        })],
      });
    }

    const remaining = useCooldown(
      guildId,
      userId,
      'coinflip',
      COOLDOWN_MS
    );

    if (remaining > 0) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Coin Flip',
          description: `You are on cooldown for **${formatDuration(remaining)}**.`,
        })],
      });
    }

    const removed = client.economy.removeCrowns(
      guildId,
      userId,
      amount,
      {
        type: 'coinflip_bet',
        reason: 'Coin flip bet',
        actorId: userId,
      }
    );

    if (!removed) {
      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Coin Flip',
          description: 'You do not have enough Crowns.',
        })],
      });
    }

    // Resolve and settle the wager once. The shared lock remains held
    // until the animation/result message has finished.
    const flip = Math.random() < 0.495 ? 'heads' : 'tails';
    const won = choice === flip;
    let winnings = 0;

    try {
      if (won) {
        const boostedProfit = boostProfit(
          client,
          guildId,
          userId,
          amount
        );
        winnings = amount + boostedProfit;

        client.economy.addCrowns(
          guildId,
          userId,
          winnings,
          {
            type: 'coinflip_win',
            reason: 'Coin flip winnings',
            actorId: userId,
          }
        );
      }
    } catch (error) {
      console.error('[Coinflip] Settlement failed:', error);
      client.economy.addCrowns(guildId, userId, amount, {
        type: 'coinflip_refund',
        reason: 'Coin flip settlement error refund',
        actorId: userId,
      });

      return message.reply({
        content: 'Something went wrong settling the coin flip. Your bet was refunded.',
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
    }

    const newBalance = client.economy.getBalance(guildId, userId);
    await trackClanGame(client, message, 'coinflip', won);

    const resultText = won
      ? `You got it! It was **${flip}**.\n**${money(client, winnings - amount)}** earned.`
      : `Wrong guess, it was **${flip}**.\nYou lost **${money(client, amount)}**.`;

    const animationFrames = ['◉', '◐', '○', '◑', '◉'];
    const makeAnimationEmbed = frame => buildEmbed(message, {
      title: '🎲 Coin Flip',
      description:
        `**Flipping...**\n\n` +
        `\`${frame}\`\n\n` +
        `**Choice:** ${choice}\n` +
        `**Balance:** ${money(client, balance - amount)}`,
      thumbnail: message.author.displayAvatarURL({ size: 256 }),
      footer: `Requested by ${message.author.username}`,
    });

    let sentMessage;
    try {
      sentMessage = await message.reply({
        embeds: [makeAnimationEmbed(animationFrames[0])],
        allowedMentions: { repliedUser: false },
      });
    } catch (error) {
      console.error('[Coinflip] Could not send animation:', error?.message || error);
      return message.channel.send({
        embeds: [buildEmbed(message, {
          title: '🎲 Coin Flip Result',
          description:
            `${resultText}\n\n` +
            `**Choice:** ${choice}\n` +
            `**Balance:** ${money(client, newBalance)}`,
          thumbnail: message.author.displayAvatarURL({ size: 256 }),
          footer: `Requested by ${message.author.username}`,
        })],
      }).catch(() => null);
    }

    for (let i = 1; i < animationFrames.length; i++) {
      await delay(ANIMATION_DELAY_MS);
      try {
        await sentMessage.edit({
          embeds: [makeAnimationEmbed(animationFrames[i])],
        });
      } catch (error) {
        console.error('[Coinflip] Animation edit failed:', error?.message || error);
        break;
      }
    }

    const finalEmbed = buildEmbed(message, {
      title: '🎲 Coin Flip',
      description:
        `${resultText}\n\n` +
        `**Choice:** ${choice}\n` +
        `**Balance:** ${money(client, newBalance)}`,
      thumbnail: message.author.displayAvatarURL({ size: 256 }),
      footer: `Requested by ${message.author.username}`,
    });

    try {
      return await sentMessage.edit({ embeds: [finalEmbed] });
    } catch (error) {
      console.error('[Coinflip] Final message edit failed:', error?.message || error);
      return message.channel.send({ embeds: [finalEmbed] }).catch(() => null);
    }
  }),
};
