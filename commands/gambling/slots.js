// commands/gambling/slots.js
const { EmbedBuilder } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');

const SYMBOLS = ['CHERRY','LEMON','BELL','STAR','7','BAR'];

module.exports = {
  name: 'slots',
  aliases: [],
  category: 'gambling',
  usage: '!slots <amount>',
  description: 'Slots spin. No emojis. Max bet 100k.',
  async execute(client, message, args) {
    const cooldown = gh.getCooldown(message.author.id, 'slots');
    if (cooldown > 0) return message.reply(`Wait ${Math.ceil(cooldown/1000)}s before using Slots again.`);

    const bet = parseInt(args[0], 10);
    const v = gh.validateBet(bet);
    if (!v.ok) return message.reply(v.reason);

    const wallet = await gh.getWallet(client, message.author.id);
    if (wallet < v.amount) return message.reply('Insufficient funds.');

    await gh.changeWallet(client, message.author.id, -v.amount);

    const s = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const a = s(), b = s(), c = s();

    let payout = 0;
    if (a === b && b === c && a === '7') payout = v.amount * 10; // jackpot
    else if (a === b && b === c) payout = Math.floor(v.amount * 1.5); // triple
    else if (a === b || a === c || b === c) payout = Math.floor(v.amount * 0.5); // double
    // else lost

    if (payout > 0) {
      await gh.changeWallet(client, message.author.id, payout);
      await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
    }

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('Slots Result')
      .addFields(
        { name: 'Reel', value: `| ${a} | ${b} | ${c} |`, inline: false }
      )
      .setDescription(payout > 0 ? `You won **${payout}** Vyncoins.` : `You lost **${v.amount}** Vyncoins.`);

    gh.setCooldown(message.author.id, 'slots');
    return message.channel.send({ embeds: [embed] });
  }
};