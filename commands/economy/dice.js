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

function money(client, amount) {
  return client?.economy?.formatCurrency
    ? client.economy.formatCurrency(amount)
    : `${Number(amount || 0).toLocaleString('en-US')} Crowns`;
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function parsePick(raw) {
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
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
        embeds: [buildEmbed(message, { title: 'Economy Unavailable', description: 'The economy system is not ready.' })],
      });
    }

    const amount = parseInt(args[0], 10);
    const pick1 = parsePick(args[1]);
    const pick2 = parsePick(args[2]);

    if (!Number.isInteger(amount) || amount <= 0 || !pick1 || !pick2 || pick1 === pick2) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Dice',
            description: 'Use: `$dice <amount> <number1> <number2>`\nThe two numbers must be different and between 1 and 6.',
          }),
        ],
      });
    }

    if (amount > MAX_BET) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Dice',
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
            title: 'Dice',
            description: `You only have **${money(client, balance)}**.`,
          }),
        ],
      });
    }

    const remaining = useCooldown(message.guild.id, message.author.id, 'dice', COOLDOWN_MS);
    if (remaining > 0) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Dice',
            description: `You are on cooldown for **${formatDuration(remaining)}**.`,
          }),
        ],
      });
    }

    const removed = client.economy.removeCrowns(message.guild.id, message.author.id, amount, {
      type: 'dice_bet',
      reason: 'Dice bet',
      actorId: message.author.id,
    });

    if (!removed) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Dice',
            description: 'You do not have enough Crowns.',
          }),
        ],
      });
    }

    const rollA = rollDie();
    const rollB = rollDie();

    const matchCount =
      (rollA === pick1 || rollA === pick2 ? 1 : 0) +
      (rollB === pick1 || rollB === pick2 ? 1 : 0);

    const baseProfit =
      matchCount === 1 ? amount :
      matchCount === 2 ? amount * 2 :
      0;

    let winnings = 0;
    if (baseProfit > 0) {
      const boostedProfit = boostProfit(client, message.guild.id, message.author.id, baseProfit);
      winnings = amount + boostedProfit;

      client.economy.addCrowns(message.guild.id, message.author.id, winnings, {
        type: 'dice_win',
        reason: 'Dice winnings',
        actorId: message.author.id,
      });
    }

    const newBalance = client.economy.getBalance(message.guild.id, message.author.id);

    const embed = buildEmbed(message, {
      title: 'Dice',
      description:
        `Bet\n↳ ${money(client, amount)}\n\n` +
        `Your Numbers\n↳ ${pick1} and ${pick2}\n\n` +
        `Roll\n↳ ${rollA} and ${rollB}\n\n` +
        `Matches\n↳ ${matchCount}\n\n` +
        `Result\n↳ ${baseProfit > 0 ? `You won ${money(client, winnings - amount)}` : 'You lost'}\n\n` +
        `Balance\n↳ ${money(client, newBalance)}`,
      thumbnail: message.author.displayAvatarURL({ size: 256 }),
    });

    return message.reply({ embeds: [embed] });
  },
};