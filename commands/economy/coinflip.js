const { EmbedBuilder } = require('discord.js');
const {
  formatDuration,
  useCooldown,
  boostProfit,
} = require('../../handlers/gamblingHelpers');

const MAX_BET = 25_000;
const COOLDOWN_MS = 10_000;

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
      if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
      else embed.setFooter(data.footer);
    }

    return embed;
  }

  const embed = new EmbedBuilder().setColor('#5b0000').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) {
    if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
    else embed.setFooter(data.footer);
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

module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  description: 'Bet on heads or tails.',
  category: 'economy',
  usage: '$coinflip <amount> <h/t>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.economy) {
      return message.reply({
        embeds: [buildEmbed(message, { title: 'Economy Unavailable', description: 'The economy system is not ready.' })],
      });
    }

    const amount = parseInt(args[0], 10);
    const choice = parseChoice(args[1]);

    if (!Number.isInteger(amount) || amount <= 0 || !choice) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Coin Flip',
            description: 'Use: `$coinflip <amount> <h/t>`',
          }),
        ],
      });
    }

    if (amount > MAX_BET) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Coin Flip',
            description: `Maximum bet is **${money(client, MAX_BET)}**.`,
          }),
        ],
      });
    }

    const balance = client.economy.getBalance(message.guild.id, message.author.id);
    if (balance < amount) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Coin Flip',
            description: `You only have **${money(client, balance)}**.`,
          }),
        ],
      });
    }

    const remaining = useCooldown(message.guild.id, message.author.id, 'coinflip', COOLDOWN_MS);
    if (remaining > 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Coin Flip',
            description: `You are on cooldown for **${formatDuration(remaining)}**.`,
          }),
        ],
      });
    }

    const removed = client.economy.removeCrowns(message.guild.id, message.author.id, amount, {
      type: 'coinflip_bet',
      reason: 'Coin flip bet',
      actorId: message.author.id,
    });

    if (!removed) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Coin Flip',
            description: 'You do not have enough Crowns.',
          }),
        ],
      });
    }

    const flip = Math.random() < 0.495 ? 'heads' : 'tails';
    const won = choice === flip;

    let winnings = 0;
    if (won) {
      const baseProfit = amount;
      const boostedProfit = boostProfit(client, message.guild.id, message.author.id, baseProfit);
      winnings = amount + boostedProfit;

      client.economy.addCrowns(message.guild.id, message.author.id, winnings, {
        type: 'coinflip_win',
        reason: 'Coin flip winnings',
        actorId: message.author.id,
      });
    }

    const newBalance = client.economy.getBalance(message.guild.id, message.author.id);

    const resultText = won
      ? `You got it! It was **${flip}**.\n**${money(client, winnings - amount)}** earned.`
      : `Wrong guess, it was **${flip}**.\nYou lost **${money(client, amount)}**.`;

    const embed = buildEmbed(message, {
      title: '🎲 Coin Flip',
      description:
        `${resultText}\n\n` +
        `**Choice:** ${choice}\n` +
        `**Balance:** ${money(client, newBalance)}`,
      thumbnail: message.author.displayAvatarURL({ size: 256 }),
      footer: `Requested by ${message.author.username}`,
    });

    return message.reply({ embeds: [embed] });
  },
};