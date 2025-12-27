// commands/gambling/coinflip.js
const { EmbedBuilder } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');

module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  category: 'gambling',
  usage: '!coinflip <heads|tails> <amount>',
  description: 'Coinflip. Neutral RNG. Max bet 100k.',
  async execute(client, message, args) {
    // Permission: everyone can use
    const choice = (args[0] || '').toLowerCase();
    const amtRaw = args[1];
    if (!['heads','tails'].includes(choice)) return message.reply('Usage: `!coinflip <heads|tails> <amount>`');

    const bet = parseInt(amtRaw, 10);
    const v = gh.validateBet(bet);
    if (!v.ok) return message.reply(v.reason);

    // wallet
    const wallet = await gh.getWallet(client, message.author.id);
    if (wallet == null) return gh.badSetupReply(message.channel);
    if (wallet < v.amount) return message.reply('Insufficient funds.');

    // Outcomes:
    // clean win: probability ~47.5% => payout +0.95*bet (house edge)
    // soft win (smaller): not used explicitly, we implement:
    // - 2% jackpot => 4x bet (user asked earlier)
    // - otherwise 50/50 win/lose with neutral-ish payout (we do +0.95*bet)
    // Implementation:
    const roll = Math.random();
    const coin = roll < 0.5 ? 'heads' : 'tails';

    // charge bet first
    await gh.changeWallet(client, message.author.id, -v.amount);

    let resultEmbed = new EmbedBuilder().setColor('#5865F2').setTitle('Coinflip Result');
    if (roll < 0.02) {
      // jackpot 2%
      const payout = v.amount * 4;
      await gh.changeWallet(client, message.author.id, payout);
      await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
      resultEmbed.setDescription(`Result: ${coin}\nYou hit the jackpot! You won **${payout}** Vyncoins.`);
    } else if (choice === coin) {
      const payout = Math.floor(v.amount * 0.95);
      await gh.changeWallet(client, message.author.id, payout);
      await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
      resultEmbed.setDescription(`Result: ${coin}\nYou won **${payout}** Vyncoins.`);
    } else {
      resultEmbed.setDescription(`Result: ${coin}\nYou lost **${v.amount}** Vyncoins.`);
    }

    return message.channel.send({ embeds: [resultEmbed] });
  }
};