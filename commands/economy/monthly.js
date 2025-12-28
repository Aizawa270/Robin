// commands/economy/claimmonthly.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'monthly',
  aliases: ['monthly'],
  category: 'economy',
  usage: '!claimmonthly',
  async execute(client, message, args) {
    const userId = message.author.id;
    if (!econ.canClaimMonthly(userId)) {
      const u = econ.getUser(userId);
      return message.reply(`You don't meet monthly requirements. You need ${econ.MONTHLY_REQUIRED_DAILIES || 14} dailies and ${econ.MONTHLY_NON_GAMBLING_REQ || 500000} non-gambling earned. You have ${u.dailies_this_month} dailies and ${u.non_gambling_earned_month} earned.`);
    }
    const award = econ.claimMonthly(userId);
    if (!award) return message.reply('Failed to claim monthly (unknown).');
    const embed = new EmbedBuilder().setColor('#22c55e').setTitle('Monthly Claimed').setDescription(`You received **${award}** Vyncoins!`);
    return message.reply({ embeds: [embed] });
  }
};