// commands/economy/bal.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'bal',
  description: 'Show your balance.',
  category: 'economy',
  usage: '!bal',
  aliases: ['balance'],
  async execute(client, message, args) {
    const target = message.mentions.users.first() || message.author;
    econ.ensureUser(target.id);
    const user = econ.getUser(target.id);

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`${target.username}'s Balance`)
      .addFields(
        { name: 'Wallet', value: `${user.wallet} Vyncoins`, inline: true },
        { name: 'Bank', value: `${user.bank} Vyncoins`, inline: true },
        { name: 'Lifetime Earned', value: `${user.lifetime_earned} Vyncoins`, inline: true },
        { name: 'Lifetime Lost', value: `${user.lifetime_lost} Vyncoins`, inline: true }
      );

    return message.reply({ embeds: [embed] });
  }
};