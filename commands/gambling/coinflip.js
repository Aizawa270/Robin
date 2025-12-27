const { EmbedBuilder } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');

module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  category: 'gambling',
  usage: '!coinflip <heads|tails> <amount>',
  description: 'Coinflip. Max bet 100k. Cooldown 15s.',
  async execute(client, message, args) {
    const cooldown = gh.getCooldown(message.author.id, 'coinflip');
    if (cooldown > 0) return message.reply(`Wait ${Math.ceil(cooldown/1000)}s before using Coinflip again.`);

    const choice = (args[0] || '').toLowerCase();
    const bet = parseInt(args[1], 10);
    if (!['heads','tails'].includes(choice)) return message.reply('Usage: `!coinflip <heads|tails> <amount>`');

    const v = gh.validateBet(bet);
    if (!v.ok) return message.reply(v.reason);

    const wallet = await gh.getWallet(client, message.author.id);
    if (wallet < v.amount) return message.reply('Insufficient funds.');

    await gh.changeWallet(client, message.author.id, -v.amount);

    const coin = Math.random() < 0.5 ? 'heads' : 'tails';
    let payout = 0;
    let desc = '';
    if (Math.random() < 0.02) { // jackpot
      payout = v.amount * 4;
      desc = `Result: ${coin}\nJackpot! You won **${payout}** Vyncoins.`;
    } else if (choice === coin) {
      payout = Math.floor(v.amount * 0.95);
      desc = `Result: ${coin}\nYou won **${payout}** Vyncoins.`;
    } else {
      desc = `Result: ${coin}\nYou lost **${v.amount}** Vyncoins.`;
    }

    if (payout > 0) {
      await gh.changeWallet(client, message.author.id, payout);
      await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
    }

    gh.setCooldown(message.author.id, 'coinflip');
    return message.channel.send({ embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('Coinflip').setDescription(desc)] });
  }
};