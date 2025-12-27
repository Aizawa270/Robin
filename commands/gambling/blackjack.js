const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');

const COOLDOWN_CMD = 'blackjack';
const MAX_BET = 100_000;
const SYMBOLS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function cardValue(card) {
  if (['J','Q','K'].includes(card)) return 10;
  if (card === 'A') return 11; // handle Ace as 11 initially
  return parseInt(card,10);
}

function handValue(hand) {
  let total = hand.reduce((acc, c) => acc + cardValue(c), 0);
  let aces = hand.filter(c => c === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10; // convert Ace 11 -> 1
    aces--;
  }
  return total;
}

function drawCard() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

module.exports = {
  name: 'blackjack',
  aliases: ['bj'],
  category: 'gambling',
  usage: '!blackjack <bet>',
  description: 'Play blackjack. H=Hit, S=Stand. Max bet 100k.',
  async execute(client, message, args) {
    // Cooldown
    const cooldown = gh.getCooldown(message.author.id, COOLDOWN_CMD);
    if (cooldown > 0) return message.reply(`Wait ${Math.ceil(cooldown/1000)}s before using Blackjack again.`);

    const bet = parseInt(args[0],10);
    const v = gh.validateBet(bet);
    if (!v.ok) return message.reply(v.reason);

    const wallet = await gh.getWallet(client, message.author.id);
    if (wallet < v.amount) return message.reply('Insufficient funds.');

    await gh.changeWallet(client, message.author.id, -v.amount);

    // Initial hands
    let playerHand = [drawCard(), drawCard()];
    let dealerHand = [drawCard(), drawCard()];

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hit').setLabel('Hit (H)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('stand').setLabel('Stand (S)').setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('Blackjack')
      .setDescription(`Your hand: ${playerHand.join(' , ')} (Total: ${handValue(playerHand)})\nDealer: ${dealerHand[0]} , ?`)
      .setFooter({ text: `Bet: ${v.amount} Vyncoins` });

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 2*60*1000
    });

    let ended = false;

    collector.on('collect', async i => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Not your game.', ephemeral: true });

      if (i.customId === 'hit') {
        playerHand.push(drawCard());
        const total = handValue(playerHand);
        if (total > 21) {
          ended = true;
          await i.update({
            embeds: [embed.setDescription(`Your hand: ${playerHand.join(' , ')} (BUST!)\nDealer: ${dealerHand.join(' , ')} (Total: ${handValue(dealerHand)})`)],
            components: []
          });
          collector.stop('bust');
        } else {
          await i.update({
            embeds: [embed.setDescription(`Your hand: ${playerHand.join(' , ')} (Total: ${total})\nDealer: ${dealerHand[0]} , ?`)],
            components: [row]
          });
        }
      } else if (i.customId === 'stand') {
        ended = true;
        collector.stop('stand');
      }
    });

    collector.on('end', async (collected, reason) => {
      if (!ended) reason = 'timeout';

      // Dealer plays if player didn't bust
      if (reason !== 'bust') {
        while (handValue(dealerHand) < 17) dealerHand.push(drawCard());
      }

      const playerTotal = handValue(playerHand);
      const dealerTotal = handValue(dealerHand);
      let payout = 0;
      let resultText = '';

      if (playerTotal > 21) resultText = 'You busted! You lose.';
      else if (dealerTotal > 21 || playerTotal > dealerTotal) { 
        payout = v.amount*2; 
        resultText = `You won! You receive **${payout}** Vyncoins.`; 
      }
      else if (playerTotal === dealerTotal) { 
        payout = v.amount; 
        resultText = `Push! Your bet is returned.`; 
      }
      else resultText = 'Dealer wins. You lose.';

      if (payout > 0) {
        await gh.changeWallet(client, message.author.id, payout);
        await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
      }

      const finalEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('Blackjack Result')
        .setDescription(`Your hand: ${playerHand.join(' , ')} (Total: ${playerTotal})\nDealer: ${dealerHand.join(' , ')} (Total: ${dealerTotal})\n\n${resultText}`)
        .setFooter({ text: `Bet: ${v.amount} Vyncoins` });

      gh.setCooldown(message.author.id, COOLDOWN_CMD);
      await msg.edit({ embeds: [finalEmbed], components: [] });
    });
  }
};