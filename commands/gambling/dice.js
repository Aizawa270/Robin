// commands/gambling/dice.js
const { EmbedBuilder } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');

module.exports = {
  name: 'dice',
  aliases: ['d'],
  category: 'gambling',
  usage: '!dice <num1> [num2] <bet>',
  description: 'Rolls two dice (1-6). Pick 1 or 2 numbers. If a pick matches either die you win bet. If both dice match picks you win double.',
  async execute(client, message, args) {
    // Expect either: !dice 3 100  OR !dice 2 5 100 (num1 num2 bet)
    if (args.length < 2) return message.reply('Usage: `!dice <num1> [num2] <bet>`');

    // last arg is bet
    const bet = parseInt(args[args.length - 1], 10);
    const v = gh.validateBet(bet);
    if (!v.ok) return message.reply(v.reason);

    // parse picks
    const picksRaw = args.slice(0, args.length - 1);
    const picks = [...new Set(picksRaw.map(x => parseInt(x, 10)).filter(n => Number.isInteger(n)))];
    if (picks.length === 0 || picks.length > 2) return message.reply('Pick one or two numbers between 1 and 6.');

    for (const p of picks) {
      if (p < 1 || p > 6) return message.reply('Numbers must be between 1 and 6.');
    }

    const wallet = await gh.getWallet(client, message.author.id);
    if (wallet == null) return gh.badSetupReply(message.channel);
    if (wallet < v.amount) return message.reply('Insufficient funds.');

    // charge bet
    await gh.changeWallet(client, message.author.id, -v.amount);

    // roll two dice
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;

    let wins = 0;
    // count matches
    for (const die of [die1, die2]) {
      for (const pick of picks) {
        if (die === pick) { wins += 1; break; }
      }
    }

    const embed = new EmbedBuilder().setColor('#5865F2').setTitle('Dice Result')
      .setDescription(`Rolls: **${die1}**, **${die2}**`);

    if (wins === 0) {
      embed.addFields({ name: 'Outcome', value: `No matches. You lost **${v.amount}** Vyncoins.` });
    } else if (wins === 1) {
      // match one die -> win = bet
      await gh.changeWallet(client, message.author.id, v.amount);
      await gh.addMonthlyGamblingProgress(client, message.author.id, v.amount);
      embed.addFields({ name: 'Outcome', value: `One match. You won **${v.amount}** Vyncoins.` });
    } else if (wins >= 2) {
      // both dice matched -> double
      const payout = v.amount * 2;
      await gh.changeWallet(client, message.author.id, payout);
      await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
      embed.addFields({ name: 'Outcome', value: `Both matched. You won **${payout}** Vyncoins.` });
    }

    return message.channel.send({ embeds: [embed] });
  }
};