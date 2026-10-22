const {
  withdrawFromBank,
  parseAmount,
  buildEmbed,
  formatMoney,
} = require('../../handlers/economyExtras');

module.exports = {
  name: 'withdraw',
  aliases: ['wd'],
  description: 'Withdraw Crowns from your personal bank.',
  category: 'economy',
  usage: '$withdraw <amount|all>',

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
              '`$withdraw 5000`\n' +
              '`$withdraw all`',
          }),
        ],
      });
    }

    const result = withdrawFromBank(
      message.guild.id,
      message.author.id,
      parsed.amount
    );

    if (!result.ok) {
      let description =
        'The withdrawal could not be completed. Please try again.';

      if (result.code === 'empty_bank') {
        description =
          "You don't have any Crowns in your personal bank to withdraw.";
      } else if (result.code === 'insufficient_bank') {
        description =
          `You don't have enough Crowns in your personal bank.\n\n` +
          `Bank balance: **${formatMoney(
            client,
            result.bank || 0
          )}**`;
      }

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Withdrawal Failed',
            description,
          }),
        ],
      });
    }

    const embed = buildEmbed(message, {
      title: 'Withdrawal Successful',
      description:
        `Withdrew **${formatMoney(client, result.amount)}** from your personal bank.\n\n` +
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