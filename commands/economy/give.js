const {
  resolveTargetUser,
} = require('../../handlers/economyHelpers');

const {
  transferCash,
  parseAmount,
  buildEmbed,
  formatMoney,
} = require('../../handlers/economyExtras');

module.exports = {
  name: 'give',
  aliases: ['pay', 'send'],
  description: 'Give Crowns to another member.',
  category: 'economy',
  usage: '$give @user <amount>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const rawTarget = args[0];

    const target =
      message.mentions.users.first() ||
      (rawTarget
        ? await resolveTargetUser(client, message, rawTarget)
            .catch(() => null)
        : null);

    if (!target) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Invalid Recipient',
            description:
              'Mention a server member or provide their user ID.\n\n' +
              'Usage: `$give @user 5000`',
          }),
        ],
      });
    }

    if (target.id === message.author.id) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Invalid Transfer',
            description: "You can't give Crowns to yourself.",
          }),
        ],
      });
    }

    if (target.bot) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Invalid Recipient',
            description: "You can't give Crowns to a bot.",
          }),
        ],
      });
    }

    const targetMember =
      message.guild.members.cache.get(target.id) ||
      await message.guild.members.fetch(target.id).catch(() => null);

    if (!targetMember) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Invalid Recipient',
            description:
              'That user must be a member of this server to receive Crowns.',
          }),
        ],
      });
    }

    const parsed = parseAmount(args[1]);

    if (!parsed.ok) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Invalid Amount',
            description:
              'Enter a positive whole number of Crowns.\n\n' +
              'Usage: `$give @user 5000`',
          }),
        ],
      });
    }

    const result = transferCash(
      message.guild.id,
      message.author.id,
      target.id,
      parsed.amount
    );

    if (!result.ok && result.code === 'insufficient_wallet') {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Insufficient Funds',
            description:
              `You don't have enough Crowns in your wallet.\n\n` +
              `Wallet balance: **${formatMoney(
                client,
                result.wallet || 0
              )}**`,
          }),
        ],
      });
    }

    if (!result.ok) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Transfer Failed',
            description:
              'The transfer could not be completed. Check the amount and try again.',
          }),
        ],
      });
    }

    const embed = buildEmbed(message, {
      title: 'Transfer Successful',
      description:
        `You gave **${formatMoney(client, result.amount)}** to ${target}.\n\n` +
        `Your wallet: **${formatMoney(
          client,
          result.senderBalance
        )}**`,
      thumbnail: message.author.displayAvatarURL({
        size: 256,
      }),
    });

    return message.reply({
      embeds: [embed],
      allowedMentions: {
        parse: [],
      },
    });
  },
};