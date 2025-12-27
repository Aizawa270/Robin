// commands/economy/daily.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');

const REWARDS = [5000, 10000, 15000, 20000, 25000, 30000, 50000]; // index = streak-1; 7th gives 50k then reset

function utcDay(ts = Date.now()) {
  return Math.floor(new Date(ts).getTime() / 86400000); // days since epoch UTC
}

module.exports = {
  name: 'daily',
  description: 'Claim daily reward.',
  category: 'economy',
  usage: '!daily',
  aliases: [],
  async execute(client, message, args) {
    const uid = message.author.id;
    econ.ensureUser(uid);
    const u = econ.getUser(uid);

    const lastTS = u.last_daily || 0;
    const lastDay = lastTS ? utcDay(lastTS) : -1;
    const today = utcDay();

    if (lastDay === today) {
      return message.reply('You already claimed your daily today. Come back tomorrow.');
    }

    // If lastDay == today - 1 -> streak continues
    // If lastDay < today - 1 -> streak reset
    let newStreak = 1;
    if (lastDay === today - 1) {
      newStreak = (u.daily_streak || 0) + 1;
    } else {
      newStreak = 1;
    }

    let reward;
    if (newStreak >= 7) {
      reward = REWARDS[6];
      newStreak = 0; // reset after giving 50k
    } else {
      reward = REWARDS[Math.max(0, newStreak - 1)];
    }

    // apply reward
    econ.addWallet(uid, reward);
    econ.addLifetimeEarned(uid, reward);
    econ.setLastDaily(uid, Date.now());
    econ.setDailyStreak(uid, newStreak);
    econ.incrementDailiesMonth(uid);
    econ.addNonGamblingEarnedMonth(uid, reward);

    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle('Daily Claimed')
      .setDescription(`You claimed **${reward} Vyncoins**.\nCurrent streak: ${newStreak}`);

    return message.reply({ embeds: [embed] });
  }
};