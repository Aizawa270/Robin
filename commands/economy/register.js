const {
  buildEmbed,
  formatMoney,
} = require('../../handlers/economyExtras');

const STARTING_BONUS = 5000;

module.exports = {
  name: 'register',
  aliases: [],
  description: 'Register for the economy and receive starting Crowns.',
  category: 'economy',
  usage: '$register',

  async execute(client, message) {
    if (!message.guild) return;

    const economy = client.economy;

    if (!economy?.registerUser) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Registration Unavailable',
            description:
              'The economy system is currently unavailable. Please try again later.',
          }),
        ],
      });
    }

    const result = economy.registerUser(
      message.guild.id,
      message.author.id,
      STARTING_BONUS
    );

    if (!result.ok && result.code === 'already_registered') {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Already Registered',
            description:
              'You already have an economy account!\n\n' +
              'Your existing progress and Crowns are safe.',
            thumbnail: message.author.displayAvatarURL({
              size: 256,
            }),
          }),
        ],
      });
    }

    if (!result.ok) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Registration Failed',
            description:
              'Something went wrong while creating your economy account. Please try again.',
          }),
        ],
      });
    }

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Registration Successful',
          description:
            `Welcome to the economy!\n\n` +
            `Starting Bonus\n` +
            `↳ **${formatMoney(client, result.amount)}**\n\n` +
            `Your economy account is ready. You can now use all economy commands.`,
          thumbnail: message.author.displayAvatarURL({
            size: 256,
          }),
        }),
      ],
    });
  },
};