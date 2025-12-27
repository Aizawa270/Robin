const { EmbedBuilder } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');

module.exports = {
  name: 'dice',
  aliases: ['d','D'],
  category: 'gambling',
  usage: '!dice <num1> [num2] <bet>',
  description: 'Rolls 1-2 dice. Match one or both. Cooldown 15s.',
  async execute(client, message, args) {
    const cooldown = gh.getCooldown(message.author.id, 'dice');
    if (cooldown > 0) return message.reply(`Wait ${Math.ceil(cooldown/1000)}s before using Dice again.`);

    if (args.length < 2) return message.reply('Usage: `!dice <num1> [num2] <bet>`');

    const bet = parseInt(args[args.length-1], 10);
    const v = gh.validateBet(bet);
    if (!v.ok) return message.reply(v.reason);

    const picks = [...new Set(args.slice(0, args.length-1).map(x => parseInt(x,10)))].filter(n => n>=1 && n<=6);
    if (picks.length === 0 || picks.length > 2) return message.reply('Pick 1 or 2 numbers between 1 and 6.');

    const wallet = await gh.getWallet(client, message.author.id);
    if (wallet < v.amount) return message.reply('Insufficient funds.');

    await gh.changeWallet(client, message.author.id, -v.amount);

    const die1 = Math.floor(Math.random()*6)+1;
    const die2 = Math.floor(Math.random()*6)+1;

    let matches = 0;
    for (const die of [die1,die2]) for (const pick of picks) if (die===pick) matches++;

    let payout = 0;
    let outcome = '';
    if (matches === 0) outcome = `No matches. You lost **${v.amount}** Vyncoins.`;
    else if (matches === 1) { payout = v.amount; outcome = `One match! You won **${payout}** Vyncoins.`; }
    else if (matches >= 2) { payout = v.amount*2; outcome = `Both matched! You won **${payout}** Vyncoins.`; }

    if (payout>0){
      await gh.changeWallet(client, message.author.id, payout);
      await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
    }

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('Dice Roll')
      .addFields({ name:'Rolls', value:`**${die1}**, **${die2}**` })
      .setDescription(outcome);

    gh.setCooldown(message.author.id, 'dice');
    return message.channel.send({ embeds: [embed] });
  }
};