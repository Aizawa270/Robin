// commands/gambling/blackjack.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const gh = require('../../handlers/gamblingHelper');

function createDeck() {
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = ['♠','♥','♦','♣'];
  const deck = [];
  for (const r of ranks) for (const s of suits) deck.push({ code: `${r}${s}`, rank: r });
  return deck;
}
function shuffle(arr) {
  for (let i = arr.length -1; i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = c.rank;
    if (r === 'A') { aces++; total += 11; }
    else if (['J','Q','K'].includes(r)) total += 10;
    else total += parseInt(r,10);
  }
  while (total > 21 && aces > 0) {
    total -= 10; aces--;
  }
  return total;
}

module.exports = {
  name: 'blackjack',
  aliases: ['bj'],
  category: 'gambling',
  usage: '!blackjack <amount>',
  description: 'Play blackjack. Hit/Stand via buttons. Dealer hits soft 17.',
  async execute(client, message, args) {
    const bet = parseInt(args[0], 10);
    const v = gh.validateBet(bet);
    if (!v.ok) return message.reply(v.reason);
    const wallet = await gh.getWallet(client, message.author.id);
    if (wallet == null) return gh.badSetupReply(message.channel);
    if (wallet < v.amount) return message.reply('Insufficient funds.');

    // charge bet upfront
    await gh.changeWallet(client, message.author.id, -v.amount);

    // prepare deck
    let deck = shuffle(createDeck());

    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];

    let playerVal = handValue(player);
    let dealerVal = handValue(dealer);

    const embed = new EmbedBuilder().setColor('#5865F2').setTitle('Blackjack');
    function updateEmbed(desc) {
      embed.setDescription(desc)
        .setFields(
          { name: 'Player', value: `${player.map(c=>c.code).join(' ')}\nValue: ${handValue(player)}` },
          { name: 'Dealer', value: `${dealer[0].code} [hidden]` }
        );
    }

    updateEmbed('Game started. Choose Hit or Stand.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary)
    );

    const sent = await message.channel.send({ embeds: [embed], components: [row] });

    const filter = (i) => i.user.id === message.author.id;
    const collector = sent.createMessageComponentCollector({ filter, time: 120000 });

    let finished = false;

    collector.on('collect', async interaction => {
      if (!interaction.isButton()) return;
      if (interaction.customId === 'bj_hit') {
        player.push(deck.pop());
        playerVal = handValue(player);
        if (playerVal > 21) {
          // busted
          finished = true;
          collector.stop('bust');
          await interaction.update({ embeds: [embed.setDescription('You busted.') .setFields(
            { name: 'Player', value: `${player.map(c=>c.code).join(' ')}\nValue: ${playerVal}` },
            { name: 'Dealer', value: `${dealer.map(c=>c.code).join(' ')}\nValue: ${dealerVal}` }
          )], components: [] });
          return;
        } else {
          // update embed
          await interaction.update({ embeds: [embed.setDescription('You hit. Choose again.').setFields(
            { name: 'Player', value: `${player.map(c=>c.code).join(' ')}\nValue: ${playerVal}` },
            { name: 'Dealer', value: `${dealer[0].code} [hidden]` }
          )] });
          return;
        }
      } else if (interaction.customId === 'bj_stand') {
        finished = true;
        collector.stop('stand');
        await interaction.update({ embeds: [embed.setDescription('You stand. Dealer turn...').setFields(
          { name: 'Player', value: `${player.map(c=>c.code).join(' ')}\nValue: ${playerVal}` },
          { name: 'Dealer', value: `${dealer[0].code} [hidden]` }
        )], components: [] });
        return;
      }
    });

    collector.on('end', async (_col, reason) => {
      // if no interactions, refund bet? we'll treat as canceled and refund partial
      if (!finished && reason === 'time') {
        await sent.edit({ components: [] });
        await gh.changeWallet(client, message.author.id, v.amount); // refund
        return message.channel.send('Blackjack timed out. Bet refunded.');
      }

      // If player busted earlier
      if (reason === 'bust') {
        // lost already (bet consumed)
        return message.channel.send({ embeds: [new EmbedBuilder().setColor('#f87171').setTitle('Blackjack').setDescription(`You busted and lost **${v.amount}** Vyncoins.`)] });
      }

      // Dealer plays (dealer hits soft 17)
      dealerVal = handValue(dealer);
      while (dealerVal < 17 || (dealerVal === 17 && dealer.some(c => c.rank === 'A') && handValue(dealer) === 17)) {
        dealer.push(deck.pop());
        dealerVal = handValue(dealer);
      }

      // Evaluate results
      playerVal = handValue(player);
      dealerVal = handValue(dealer);

      let resultEmbed = new EmbedBuilder().setColor('#5865F2').setTitle('Blackjack - Result')
        .setFields(
          { name: 'Player', value: `${player.map(c=>c.code).join(' ')}\nValue: ${playerVal}` },
          { name: 'Dealer', value: `${dealer.map(c=>c.code).join(' ')}\nValue: ${dealerVal}` }
        );

      // Blackjack check (player has 2 cards totalling 21)
      const playerBlackjack = (player.length === 2 && playerVal === 21);
      const dealerBlackjack = (dealer.length === 2 && dealerVal === 21);

      if (playerBlackjack && !dealerBlackjack) {
        const payout = Math.floor(v.amount * 1.5);
        await gh.changeWallet(client, message.author.id, v.amount + payout); // return bet + winnings
        await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
        resultEmbed.setDescription(`Blackjack! You won **${payout}** Vyncoins.`);
      } else if (dealerBlackjack && !playerBlackjack) {
        resultEmbed.setDescription(`Dealer has blackjack. You lost **${v.amount}** Vyncoins.`);
      } else if (playerVal > 21) {
        resultEmbed.setDescription(`You busted. You lost **${v.amount}** Vyncoins.`);
      } else if (dealerVal > 21 || playerVal > dealerVal) {
        const payout = v.amount;
        await gh.changeWallet(client, message.author.id, v.amount + payout);
        await gh.addMonthlyGamblingProgress(client, message.author.id, payout);
        resultEmbed.setDescription(`You beat the dealer! You won **${payout}** Vyncoins.`);
      } else if (playerVal === dealerVal) {
        // push - refund bet
        await gh.changeWallet(client, message.author.id, v.amount);
        resultEmbed.setDescription(`Push. Bet refunded.`);
      } else {
        resultEmbed.setDescription(`Dealer wins. You lost **${v.amount}** Vyncoins.`);
      }

      return message.channel.send({ embeds: [resultEmbed] });
    });
  }
};