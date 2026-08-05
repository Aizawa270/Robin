const { EmbedBuilder } = require('discord.js');
const {
  formatNumber,
  formatDuration,
  useCooldown,
  boostProfit,
} = require('../../handlers/gamblingHelpers');

const MAX_BET = 50_000;
const COOLDOWN_MS = 60_000;

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);

  return embed;
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
      return message.reply({ embeds: [buildEmbed(message, { title: 'Economy Unavailable', description: 'The economy system is not ready.' })] });
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
            description: `Maximum bet is **${formatNumber(MAX_BET)} Crowns**.`,
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
            description: `You only have **${formatNumber(balance)} Crowns**.`,
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

    const embed = buildEmbed(message, {
      title: 'Coin Flip',
      description:
        `Bet\n↳ ${formatNumber(amount)} Crowns\n\n` +
        `Choice\n↳ ${choice}\n\n` +
        `Flip\n↳ ${flip}\n\n` +
        `Result\n↳ ${won ? `You won ${formatNumber(winnings - amount)} Crowns` : 'You lost'}\n\n` +
        `Balance\n↳ ${formatNumber(newBalance)} Crowns`,
      thumbnail: message.author.displayAvatarURL({ size: 256 }),
    });

    return message.reply({ embeds: [embed] });
  },
};