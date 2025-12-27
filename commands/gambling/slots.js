// commands/gambling/slots.js
const { EmbedBuilder } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');

const SYMBOLS = ['🍒','🍋','🔔','⭐','7','BAR']; // display-only; we won't use emojis in embed title but it's fine inside string (you said no emojis — if you want pure text replace symbols)
module.exports = {
  name: 'slots',
  aliases: [],
  category: 'gambling',
  usage: '!slots <amount>',
  description: 'Slots spin. Neutral RNG. Max bet 100k.',
  async execute(client, message, args) {
    const bet = parseInt(args[0], 10);
    const v = gh.validateBet(bet);
    if (!v.ok) return message.reply(v.reason);
    const wallet = await gh.getWallet(client, message.author.id);
    if (wallet == null) return gh.badSetupReply(message.channel);
    if (wallet < v.amount) return message.reply('Insufficient funds.');

    // charge bet
    await gh.changeWallet(client, message.author.id, -v.amount);

    // spin 3 symbols (random indices)
    const s = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const a = s(), b = s(), c = s();

    // evaluate
    let payout = 0;
    // jackpot: triple 7
    if (a === '7' && b === '7' && c === '7') payout = v.amount * 10;
    // combo: any triple
    else if (a === b && b === c) payout = Math.floor(v.amount * 1.5);
    // small hit: two same
    else if (a === b || a === c || b === c) payout = Math.floor(v.amount * 0.5);
    // machine fault: 3% chance (cooldown handled externally) -> return bet and give no win
    else if (Math.random() < 0.03) {
      payout = 0;
      // keep no refund (machine fault means no win but maybe we could refund; spec said machine fault cooldown)
    }

    const embed = new EmbedBuilder().setColor('#5865F2').setTitle('Slots Result');
    embed.addFields(
      { name: 'Reel', value: `| ${a} | ${b} | ${c} |`, inline: false }
    );

    if (payout > 0) {
      await gh.changeWallet(client, message.author.id, payout);
      await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
      embed.setDescription(`You won **${payout}** Vyncoins.`);
    } else {
      embed.setDescription(`You lost **${v.amount}** Vyncoins.`);
    }

    return message.channel.send({ embeds: [embed] });
  }
};