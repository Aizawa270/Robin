// commands/economy/daily.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'daily',
  category: 'economy',
  usage: '!daily',
  async execute(client, message, args) {
    const userId = message.author.id;
    if (!econ.canClaimDaily(userId)) {
      const left = Math.ceil((24*60*60*1000 - (Date.now() - econ.getUser(userId).last_daily))/1000);
      return message.reply(`You already claimed daily. Wait ${Math.ceil(left/3600)}h ${Math.ceil((left%3600)/60)}m.`);
    }
    const amount = econ.claimDaily(userId);
    const embed = new EmbedBuilder()
      .setColor('#0ea5e9')
      .setTitle('Daily Claimed')
      .setDescription(`You claimed **${amount}** Vyncoins. Keep the streak going.`);
    return message.reply({ embeds: [embed] });
  }
};