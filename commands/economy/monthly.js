// commands/economy/monthly.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');

const MONTHLY_REQUIRE_DAILIES = 14;
const MONTHLY_REQUIRE_NON_GAMBLE = 500000;
const MONTHLY_REWARD = 2000000; // 2M
const MONTHLY_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

module.exports = {
  name: 'monthly',
  description: 'Claim monthly reward if conditions met.',
  category: 'economy',
  usage: '!monthly',
  aliases: [],
  async execute(client, message, args) {
    const uid = message.author.id;
    econ.ensureUser(uid);
    const u = econ.getUser(uid);

    const now = Date.now();
    if (u.monthly_claimed_at && (now - (u.monthly_claimed_at || 0)) < MONTHLY_COOLDOWN_MS) {
      return message.reply('You already claimed monthly recently. Wait before trying again.');
    }

    if ((u.dailies_this_month || 0) < MONTHLY_REQUIRE_DAILIES || (u.non_gambling_earned_month || 0) < MONTHLY_REQUIRE_NON_GAMBLE) {
      return message.reply(`Monthly requirements not met. Need ${MONTHLY_REQUIRE_DAILIES} dailies and ${MONTHLY_REQUIRE_NON_GAMBLE} non-gambling earnings this month.`);
    }

    // Give reward
    econ.addWallet(uid, MONTHLY_REWARD);
    econ.addLifetimeEarned(uid, MONTHLY_REWARD);
    econ.setMonthlyClaimedAt(uid, now);
    // reset monthly progress
    econ.resetMonthlyProgress(uid);

    const embed = new EmbedBuilder()
      .setColor('#06b6d4')
      .setTitle('Monthly Claimed')
      .setDescription(`You received **${MONTHLY_REWARD} Vyncoins**. Congrats.`);

    return message.reply({ embeds: [embed] });
  }
};