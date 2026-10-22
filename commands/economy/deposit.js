const {
  depositToBank,
  parseAmount,
  buildEmbed,
  formatMoney,
} = require('../../handlers/economyExtras');

module.exports = {
  name: 'deposit',
  aliases: ['dep'],
  description: 'Deposit Crowns into your personal bank.',
  category: 'economy',
  usage: '$deposit <amount|all>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const parsed = parseAmount(args[0], true);

    if (!parsed.ok) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Invalid Amount',
            description:
              'Enter a positive amount or `all`.\n\n' +
              'Examples:\n' +
              '`$deposit 5000`\n' +
              '`$deposit all`',
          }),
        ],
      });
    }

    const result = depositToBank(
      message.guild.id,
      message.author.id,
      parsed.amount
    );

    if (!result.ok) {
      let description =
        'The deposit could not be completed. Please try again.';

      if (result.code === 'empty_wallet') {
        description =
          "You don't have any Crowns in your wallet to deposit.";
      } else if (result.code === 'insufficient_wallet') {
        description =
          `You don't have enough Crowns in your wallet.\n\n` +
          `Wallet balance: **${formatMoney(
            client,
            result.wallet || 0
          )}**`;
      }

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Deposit Failed',
            description,
          }),
        ],
      });
    }

    const embed = buildEmbed(message, {
      title: 'Deposit Successful',
      description:
        `Deposited **${formatMoney(client, result.amount)}** into your personal bank.\n\n` +
        `Wallet: **${formatMoney(client, result.wallet)}**\n` +
        `Bank: **${formatMoney(client, result.bank)}**`,
      thumbnail: message.author.displayAvatarURL({
        size: 256,
      }),
    });

    return message.reply({
      embeds: [embed],
    });
  },
};