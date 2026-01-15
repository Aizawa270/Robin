// commands/misc/mathbattle.js
const { EmbedBuilder } = require('discord.js');

// Active games tracker
const activeGames = new Map();

// Difficulty settings
const DIFFICULTY = {
  easy: {
    name: 'Easy',
    operations: ['+', '-'],
    maxNumber: 20,
    timeLimit: 20000,
    emoji: '🟢'
  },
  medium: {
    name: 'Medium',
    operations: ['+', '-', '×'],
    maxNumber: 50,
    timeLimit: 15000,
    emoji: '🟡'
  },
  hard: {
    name: 'Hard',
    operations: ['+', '-', '×', '÷'],
    maxNumber: 100,
    timeLimit: 12000,
    emoji: '🔴'
  },
  expert: {
    name: 'Expert',
    operations: ['+', '-', '×', '÷', '^'],
    maxNumber: 200,
    timeLimit: 10000,
    emoji: '🔥'
  }
};

// Generate a math problem
function generateProblem(difficulty) {
  const config = DIFFICULTY[difficulty];
  const operation = config.operations[Math.floor(Math.random() * config.operations.length)];
  
  let num1, num2, answer, display;

  switch(operation) {
    case '+':
      num1 = Math.floor(Math.random() * config.maxNumber) + 1;
      num2 = Math.floor(Math.random() * config.maxNumber) + 1;
      answer = num1 + num2;
      display = `${num1} + ${num2}`;
      break;
      
    case '-':
      num1 = Math.floor(Math.random() * config.maxNumber) + 1;
      num2 = Math.floor(Math.random() * num1) + 1;
      answer = num1 - num2;
      display = `${num1} - ${num2}`;
      break;
      
    case '×':
      num1 = Math.floor(Math.random() * Math.min(config.maxNumber / 5, 20)) + 1;
      num2 = Math.floor(Math.random() * Math.min(config.maxNumber / 5, 20)) + 1;
      answer = num1 * num2;
      display = `${num1} × ${num2}`;
      break;
      
    case '÷':
      num2 = Math.floor(Math.random() * 12) + 1;
      answer = Math.floor(Math.random() * 15) + 1;
      num1 = num2 * answer;
      display = `${num1} ÷ ${num2}`;
      break;
      
    case '^':
      num1 = Math.floor(Math.random() * 10) + 2;
      num2 = Math.floor(Math.random() * 3) + 2;
      answer = Math.pow(num1, num2);
      display = `${num1}² to ${num1}⁴`;
      // Adjust display for powers
      if (num2 === 2) display = `${num1}²`;
      else if (num2 === 3) display = `${num1}³`;
      else if (num2 === 4) display = `${num1}⁴`;
      break;
  }

  return { display, answer };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  name: 'mathbattle',
  description: 'Compete in a fast-paced math battle',
  category: 'misc',
  usage: 'mathbattle <difficulty> [rounds]',
  aliases: ['math', 'mathgame', 'mb'],
  async execute(client, message, args) {
    if (!message.guild) return;

    const channelId = message.channel.id;

    // Check if game already running
    if (activeGames.has(channelId)) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription('A math battle is already running in this channel!');
      return message.reply({ embeds: [embed] });
    }

    // Show help if no args
    if (args.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#3b82f6')
        .setTitle('⚡ Math Battle')
        .setDescription(
          'Compete to solve math problems the fastest!\n\n' +
          '**Usage:**\n' +
          '`mathbattle <difficulty> [rounds]`\n\n' +
          '**Difficulties:**\n' +
          '🟢 `easy` - Simple addition & subtraction (1-20)\n' +
          '🟡 `medium` - Addition, subtraction & multiplication (1-50)\n' +
          '🔴 `hard` - All operations including division (1-100)\n' +
          '🔥 `expert` - Advanced math with powers (1-200)\n\n' +
          '**Examples:**\n' +
          '`mathbattle easy`\n' +
          '`mathbattle medium 15`\n' +
          '`mathbattle expert 20`\n\n' +
          '**Scoring:**\n' +
          '🥇 1st correct answer: **3 points**\n' +
          '🥈 2nd correct answer: **2 points**\n' +
          '🥉 3rd correct answer: **1 point**\n\n' +
          '**Time Limits:**\n' +
          '• Easy: 20 seconds\n' +
          '• Medium: 15 seconds\n' +
          '• Hard: 12 seconds\n' +
          '• Expert: 10 seconds'
        )
        .setFooter({ text: 'Default: 10 rounds • Max: 30 rounds' });
      return message.reply({ embeds: [embed] });
    }

    const difficulty = args[0].toLowerCase();
    
    if (!['easy', 'medium', 'hard', 'expert'].includes(difficulty)) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription(
          'Invalid difficulty! Choose from:\n' +
          '`easy`, `medium`, `hard`, `expert`'
        );
      return message.reply({ embeds: [embed] });
    }

    // Parse rounds
    let rounds = 10;
    if (args[1]) {
      const parsedRounds = parseInt(args[1]);
      if (parsedRounds && parsedRounds >= 1 && parsedRounds <= 30) {
        rounds = parsedRounds;
      } else {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setDescription('Rounds must be between 1 and 30!');
        return message.reply({ embeds: [embed] });
      }
    }

    const config = DIFFICULTY[difficulty];

    // Start game
    const startEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('⚡ Math Battle Starting!')
      .setDescription(
        `Get ready for some rapid-fire math!\n\n` +
        `${config.emoji} **Difficulty:** ${config.name}\n` +
        `📊 **Rounds:** ${rounds}\n` +
        `⏱️ **Time per problem:** ${config.timeLimit / 1000} seconds\n\n` +
        `The battle will begin in 3 seconds...`
      )
      .setFooter({ text: 'Be quick and accurate to win!' });

    await message.reply({ embeds: [startEmbed] });

    // Mark game as active
    activeGames.set(channelId, true);

    // Wait 3 seconds
    await sleep(3000);

    // Game state
    const scores = new Map();
    const stats = new Map(); // Track correct/total for each player
    let currentRound = 0;

    // Start game loop
    for (let i = 0; i < rounds; i++) {
      currentRound++;
      const problem = generateProblem(difficulty);

      const questionEmbed = new EmbedBuilder()
        .setColor('#3b82f6')
        .setTitle(`${config.emoji} Problem ${currentRound} of ${rounds}`)
        .setDescription(`**${problem.display} = ?**`)
        .setFooter({ text: `${config.timeLimit / 1000} seconds to answer` });

      await message.channel.send({ embeds: [questionEmbed] });

      // Collect answers
      const winners = [];
      const collectedUsers = new Set();

      const collector = message.channel.createMessageCollector({
        filter: m => !m.author.bot && !collectedUsers.has(m.author.id),
        time: config.timeLimit
      });

      await new Promise((resolve) => {
        collector.on('collect', async (m) => {
          const guess = parseInt(m.content.trim());
          
          if (!isNaN(guess)) {
            collectedUsers.add(m.author.id);

            // Initialize stats if needed
            if (!stats.has(m.author.id)) {
              stats.set(m.author.id, { correct: 0, total: 0 });
            }
            const playerStats = stats.get(m.author.id);
            playerStats.total++;

            if (guess === problem.answer) {
              playerStats.correct++;
              winners.push({ user: m.author, message: m });

              // Award points
              if (winners.length === 1) {
                scores.set(m.author.id, (scores.get(m.author.id) || 0) + 3);
              } else if (winners.length === 2) {
                scores.set(m.author.id, (scores.get(m.author.id) || 0) + 2);
              } else if (winners.length === 3) {
                scores.set(m.author.id, (scores.get(m.author.id) || 0) + 1);
                collector.stop();
              }
            }
          }
        });

        collector.on('end', () => {
          resolve();
        });
      });

      // Show result
      let resultEmbed;

      if (winners.length > 0) {
        const winnersText = winners.map((w, i) => {
          const medals = ['🥇', '🥈', '🥉'];
          const points = [3, 2, 1];
          const playerStats = stats.get(w.user.id);
          const accuracy = ((playerStats.correct / playerStats.total) * 100).toFixed(0);
          return `${medals[i]} ${w.user} - **+${points[i]}** (${accuracy}% accuracy)`;
        }).join('\n');

        resultEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle(`✅ ${winners[0].user.username} was fastest!`)
          .setDescription(
            `**${problem.display} = ${problem.answer}**\n\n` +
            `**Points awarded:**\n${winnersText}\n\n` +
            (currentRound < rounds ? `Next problem in 4 seconds...` : 'This was the final problem!')
          )
          .setFooter({ text: `Round ${currentRound}/${rounds}` });
      } else {
        resultEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('⏰ Time\'s up!')
          .setDescription(
            `**${problem.display} = ${problem.answer}**\n\n` +
            'No one got it right this time!\n\n' +
            (currentRound < rounds ? `Next problem in 4 seconds...` : 'Game over!')
          )
          .setFooter({ text: `Round ${currentRound}/${rounds}` });
      }

      await message.channel.send({ embeds: [resultEmbed] });

      // Wait before next round
      if (currentRound < rounds) {
        await sleep(4000);
      }
    }

    // Game finished - show leaderboard
    await sleep(2000);

    const sortedScores = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    let leaderboardText = '';

    if (sortedScores.length === 0) {
      leaderboardText = 'No one scored any points!';
    } else {
      const medals = ['🥇', '🥈', '🥉'];
      sortedScores.forEach(([userId, points], index) => {
        const place = index + 1;
        const medal = medals[index] || `**${place}.**`;
        const playerStats = stats.get(userId);
        const accuracy = ((playerStats.correct / playerStats.total) * 100).toFixed(0);
        const correctCount = playerStats.correct;
        
        leaderboardText += `${medal} <@${userId}>\n`;
        leaderboardText += `└ ${points} points • ${correctCount}/${playerStats.total} correct • ${accuracy}% accuracy\n\n`;
      });
    }

    const finishEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🏆 BATTLE FINISHED!')
      .setDescription(
        `The math battle has ended!\n\n` +
        `**Final Standings:**\n\n` +
        leaderboardText
      )
      .setFooter({ text: `${rounds} problems solved • ${config.name} difficulty` });

    await message.channel.send({ embeds: [finishEmbed] });

    // Remove from active games
    activeGames.delete(channelId);
  }
};
