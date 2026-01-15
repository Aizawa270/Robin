// commands/misc/trivia.js
const { EmbedBuilder } = require('discord.js');

// Active games tracker
const activeGames = new Map();

// Question bank
const QUESTIONS = {
  general: [
    { q: 'What is the capital of France?', a: 'A', options: ['Paris', 'London', 'Berlin', 'Madrid'] },
    { q: 'How many continents are there?', a: 'C', options: ['5', '6', '7', '8'] },
    { q: 'What is the largest ocean on Earth?', a: 'B', options: ['Atlantic', 'Pacific', 'Indian', 'Arctic'] },
    { q: 'What year did World War II end?', a: 'D', options: ['1943', '1944', '1946', '1945'] },
    { q: 'What is the smallest country in the world?', a: 'A', options: ['Vatican City', 'Monaco', 'San Marino', 'Liechtenstein'] },
    { q: 'How many sides does a hexagon have?', a: 'C', options: ['4', '5', '6', '7'] },
    { q: 'What is the boiling point of water in Celsius?', a: 'B', options: ['90', '100', '110', '120'] },
    { q: 'Which planet is known as the Red Planet?', a: 'A', options: ['Mars', 'Venus', 'Jupiter', 'Saturn'] },
    { q: 'What is the largest mammal in the world?', a: 'D', options: ['Elephant', 'Giraffe', 'Whale Shark', 'Blue Whale'] },
    { q: 'How many hours are in a day?', a: 'B', options: ['12', '24', '36', '48'] },
    { q: 'What is the currency of Japan?', a: 'C', options: ['Yuan', 'Won', 'Yen', 'Dollar'] },
    { q: 'How many teeth does an adult human have?', a: 'A', options: ['32', '28', '30', '34'] },
    { q: 'What is the speed of light?', a: 'D', options: ['150,000 km/s', '200,000 km/s', '250,000 km/s', '300,000 km/s'] },
    { q: 'Which gas do plants absorb from the atmosphere?', a: 'B', options: ['Oxygen', 'Carbon Dioxide', 'Nitrogen', 'Hydrogen'] },
    { q: 'How many bones are in the human body?', a: 'C', options: ['186', '196', '206', '216'] },
  ],
  science: [
    { q: 'What is the chemical symbol for gold?', a: 'B', options: ['Gd', 'Au', 'Ag', 'Go'] },
    { q: 'What is the powerhouse of the cell?', a: 'C', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Chloroplast'] },
    { q: 'What is the atomic number of carbon?', a: 'A', options: ['6', '12', '8', '14'] },
    { q: 'What planet is closest to the sun?', a: 'D', options: ['Venus', 'Earth', 'Mars', 'Mercury'] },
    { q: 'How many elements are in the periodic table?', a: 'B', options: ['108', '118', '128', '138'] },
    { q: 'What is the study of weather called?', a: 'C', options: ['Geology', 'Astronomy', 'Meteorology', 'Seismology'] },
    { q: 'What is H2O commonly known as?', a: 'A', options: ['Water', 'Hydrogen Peroxide', 'Salt', 'Sugar'] },
    { q: 'What force keeps us on the ground?', a: 'D', options: ['Magnetism', 'Friction', 'Tension', 'Gravity'] },
    { q: 'What is the hardest natural substance on Earth?', a: 'B', options: ['Gold', 'Diamond', 'Iron', 'Platinum'] },
    { q: 'What organ pumps blood through the body?', a: 'C', options: ['Liver', 'Lungs', 'Heart', 'Kidneys'] },
    { q: 'What is the speed of sound in air?', a: 'A', options: ['343 m/s', '300 m/s', '400 m/s', '500 m/s'] },
    { q: 'What is DNA short for?', a: 'D', options: ['Dioxyribonucleic Acid', 'Diribonucleic Acid', 'Deoxyribose Acid', 'Deoxyribonucleic Acid'] },
    { q: 'How many planets are in our solar system?', a: 'B', options: ['7', '8', '9', '10'] },
    { q: 'What is the largest organ in the human body?', a: 'C', options: ['Heart', 'Liver', 'Skin', 'Brain'] },
    { q: 'What is the freezing point of water in Fahrenheit?', a: 'A', options: ['32', '0', '20', '40'] },
  ],
  history: [
    { q: 'Who was the first president of the United States?', a: 'A', options: ['George Washington', 'Thomas Jefferson', 'John Adams', 'Abraham Lincoln'] },
    { q: 'In what year did the Titanic sink?', a: 'C', options: ['1910', '1911', '1912', '1913'] },
    { q: 'Who discovered America?', a: 'B', options: ['Amerigo Vespucci', 'Christopher Columbus', 'Leif Erikson', 'Ferdinand Magellan'] },
    { q: 'What year did World War I start?', a: 'D', options: ['1912', '1913', '1915', '1914'] },
    { q: 'Who was the first man on the moon?', a: 'A', options: ['Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'Alan Shepard'] },
    { q: 'What ancient wonder is located in Egypt?', a: 'C', options: ['Colossus of Rhodes', 'Hanging Gardens', 'Great Pyramid of Giza', 'Temple of Artemis'] },
    { q: 'Who painted the Mona Lisa?', a: 'B', options: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'] },
    { q: 'What year did the Berlin Wall fall?', a: 'D', options: ['1987', '1988', '1990', '1989'] },
    { q: 'Who was the first female prime minister of the UK?', a: 'A', options: ['Margaret Thatcher', 'Theresa May', 'Queen Victoria', 'Queen Elizabeth II'] },
    { q: 'In what year did Columbus reach America?', a: 'C', options: ['1490', '1491', '1492', '1493'] },
    { q: 'Who invented the telephone?', a: 'B', options: ['Thomas Edison', 'Alexander Graham Bell', 'Nikola Tesla', 'Benjamin Franklin'] },
    { q: 'What was the name of the first atomic bomb?', a: 'D', options: ['Fat Boy', 'Big Man', 'Tall Boy', 'Little Boy'] },
    { q: 'Who wrote the Declaration of Independence?', a: 'A', options: ['Thomas Jefferson', 'Benjamin Franklin', 'John Adams', 'George Washington'] },
    { q: 'What year did the Soviet Union collapse?', a: 'C', options: ['1989', '1990', '1991', '1992'] },
    { q: 'Who was the Egyptian queen known for her beauty?', a: 'B', options: ['Nefertiti', 'Cleopatra', 'Hatshepsut', 'Nefertari'] },
  ],
  geography: [
    { q: 'What is the capital of Australia?', a: 'C', options: ['Sydney', 'Melbourne', 'Canberra', 'Brisbane'] },
    { q: 'Which country has the most population?', a: 'B', options: ['India', 'China', 'USA', 'Indonesia'] },
    { q: 'What is the longest river in the world?', a: 'A', options: ['Nile', 'Amazon', 'Yangtze', 'Mississippi'] },
    { q: 'Which desert is the largest in the world?', a: 'D', options: ['Gobi', 'Sahara', 'Arabian', 'Antarctic'] },
    { q: 'What is the smallest country in the world?', a: 'C', options: ['Monaco', 'San Marino', 'Vatican City', 'Liechtenstein'] },
    { q: 'What mountain is the tallest in the world?', a: 'B', options: ['K2', 'Mount Everest', 'Kangchenjunga', 'Lhotse'] },
    { q: 'Which country is known as the Land of the Rising Sun?', a: 'A', options: ['Japan', 'China', 'Thailand', 'South Korea'] },
    { q: 'What is the capital of Canada?', a: 'D', options: ['Toronto', 'Vancouver', 'Montreal', 'Ottawa'] },
    { q: 'Which ocean is the smallest?', a: 'C', options: ['Atlantic', 'Indian', 'Arctic', 'Southern'] },
    { q: 'How many countries are in Africa?', a: 'B', options: ['52', '54', '56', '58'] },
    { q: 'What is the largest country by area?', a: 'A', options: ['Russia', 'Canada', 'USA', 'China'] },
    { q: 'Which river runs through Egypt?', a: 'D', options: ['Amazon', 'Tigris', 'Euphrates', 'Nile'] },
    { q: 'What is the capital of Brazil?', a: 'C', options: ['Rio de Janeiro', 'Sao Paulo', 'Brasilia', 'Salvador'] },
    { q: 'Which country has the most islands?', a: 'B', options: ['Philippines', 'Sweden', 'Indonesia', 'Norway'] },
    { q: 'What is the highest waterfall in the world?', a: 'A', options: ['Angel Falls', 'Niagara Falls', 'Victoria Falls', 'Iguazu Falls'] },
  ],
  entertainment: [
    { q: 'Who directed the movie Titanic?', a: 'B', options: ['Steven Spielberg', 'James Cameron', 'Christopher Nolan', 'Martin Scorsese'] },
    { q: 'What is the highest-grossing film of all time?', a: 'A', options: ['Avatar', 'Avengers Endgame', 'Titanic', 'Star Wars'] },
    { q: 'Who played Iron Man in the Marvel movies?', a: 'C', options: ['Chris Evans', 'Chris Hemsworth', 'Robert Downey Jr', 'Mark Ruffalo'] },
    { q: 'What streaming service is known for Stranger Things?', a: 'D', options: ['Hulu', 'Disney Plus', 'Amazon Prime', 'Netflix'] },
    { q: 'Who sang the song Thriller?', a: 'B', options: ['Prince', 'Michael Jackson', 'Elvis Presley', 'Madonna'] },
    { q: 'What year was the first Harry Potter movie released?', a: 'A', options: ['2001', '2000', '2002', '1999'] },
    { q: 'Which band sang Bohemian Rhapsody?', a: 'C', options: ['The Beatles', 'Led Zeppelin', 'Queen', 'Pink Floyd'] },
    { q: 'Who won the first season of American Idol?', a: 'D', options: ['Carrie Underwood', 'Clay Aiken', 'Ruben Studdard', 'Kelly Clarkson'] },
    { q: 'What is the longest-running TV show?', a: 'B', options: ['Friends', 'The Simpsons', 'Seinfeld', 'Law and Order'] },
    { q: 'Who created the Star Wars franchise?', a: 'A', options: ['George Lucas', 'Steven Spielberg', 'J.J. Abrams', 'Rian Johnson'] },
    { q: 'What instrument does Sherlock Holmes play?', a: 'C', options: ['Piano', 'Cello', 'Violin', 'Guitar'] },
    { q: 'Which movie won the Oscar for Best Picture in 1994?', a: 'D', options: ['Pulp Fiction', 'The Shawshank Redemption', 'The Lion King', 'Forrest Gump'] },
    { q: 'Who is the author of Game of Thrones?', a: 'B', options: ['J.K. Rowling', 'George R.R. Martin', 'J.R.R. Tolkien', 'Stephen King'] },
    { q: 'What is the name of the coffee shop in Friends?', a: 'A', options: ['Central Perk', 'Java Joe', 'Brew Haven', 'Coffee Central'] },
    { q: 'Who voiced Woody in Toy Story?', a: 'C', options: ['Tim Allen', 'Billy Crystal', 'Tom Hanks', 'Robin Williams'] },
  ],
  sports: [
    { q: 'How many players are on a soccer team?', a: 'D', options: ['9', '10', '12', '11'] },
    { q: 'What sport is known as the king of sports?', a: 'A', options: ['Soccer', 'Basketball', 'Baseball', 'American Football'] },
    { q: 'How many rings are in the Olympic logo?', a: 'B', options: ['4', '5', '6', '7'] },
    { q: 'What country hosted the 2016 Summer Olympics?', a: 'C', options: ['China', 'UK', 'Brazil', 'Russia'] },
    { q: 'Who has won the most NBA championships?', a: 'D', options: ['Lakers', 'Warriors', 'Bulls', 'Celtics'] },
    { q: 'What is the national sport of Canada?', a: 'A', options: ['Lacrosse', 'Hockey', 'Baseball', 'Basketball'] },
    { q: 'How many points is a touchdown in American football?', a: 'C', options: ['5', '7', '6', '8'] },
    { q: 'What sport uses a puck?', a: 'B', options: ['Basketball', 'Ice Hockey', 'Soccer', 'Tennis'] },
    { q: 'How many Grand Slam tournaments are in tennis?', a: 'D', options: ['2', '3', '5', '4'] },
    { q: 'Who is known as the fastest man alive?', a: 'A', options: ['Usain Bolt', 'Carl Lewis', 'Jesse Owens', 'Michael Johnson'] },
    { q: 'What is the maximum score in a single frame of bowling?', a: 'C', options: ['20', '25', '30', '40'] },
    { q: 'Which country has won the most FIFA World Cups?', a: 'B', options: ['Argentina', 'Brazil', 'Germany', 'Italy'] },
    { q: 'How many minutes are in a soccer match?', a: 'D', options: ['60', '75', '80', '90'] },
    { q: 'What is the diameter of a basketball hoop in inches?', a: 'A', options: ['18', '16', '20', '22'] },
    { q: 'Who won the first Super Bowl?', a: 'C', options: ['Dallas Cowboys', 'New York Jets', 'Green Bay Packers', 'Kansas City Chiefs'] },
  ],
  technology: [
    { q: 'Who founded Microsoft?', a: 'B', options: ['Steve Jobs', 'Bill Gates', 'Elon Musk', 'Mark Zuckerberg'] },
    { q: 'What does CPU stand for?', a: 'A', options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit'] },
    { q: 'What year was the first iPhone released?', a: 'C', options: ['2005', '2006', '2007', '2008'] },
    { q: 'Who is the founder of Tesla?', a: 'D', options: ['Bill Gates', 'Jeff Bezos', 'Steve Jobs', 'Elon Musk'] },
    { q: 'What does HTML stand for?', a: 'B', options: ['Hyper Tool Markup Language', 'HyperText Markup Language', 'Home Tool Markup Language', 'Hyperlinks Text Markup Language'] },
    { q: 'What company owns YouTube?', a: 'A', options: ['Google', 'Facebook', 'Amazon', 'Microsoft'] },
    { q: 'What is the most popular programming language?', a: 'C', options: ['Java', 'C++', 'Python', 'JavaScript'] },
    { q: 'What does USB stand for?', a: 'D', options: ['Universal System Bus', 'United Serial Bus', 'Universal Storage Bus', 'Universal Serial Bus'] },
    { q: 'Who created Linux?', a: 'B', options: ['Steve Wozniak', 'Linus Torvalds', 'Dennis Ritchie', 'Ken Thompson'] },
    { q: 'What is the maximum characters in a tweet?', a: 'A', options: ['280', '140', '500', '1000'] },
    { q: 'What does AI stand for?', a: 'C', options: ['Automated Intelligence', 'Advanced Intelligence', 'Artificial Intelligence', 'Applied Intelligence'] },
    { q: 'What company developed the Android operating system?', a: 'D', options: ['Apple', 'Microsoft', 'Samsung', 'Google'] },
    { q: 'What is the name of Amazons virtual assistant?', a: 'B', options: ['Siri', 'Alexa', 'Cortana', 'Google Assistant'] },
    { q: 'What does RAM stand for?', a: 'A', options: ['Random Access Memory', 'Read Access Memory', 'Rapid Access Memory', 'Remote Access Memory'] },
    { q: 'Who founded Facebook?', a: 'C', options: ['Bill Gates', 'Steve Jobs', 'Mark Zuckerberg', 'Larry Page'] },
  ],
};

// Get random questions from a category
function getRandomQuestions(category, count) {
  const pool = QUESTIONS[category] || [];
  if (pool.length === 0) {
    // Fallback to all questions if category not found
    const allQuestions = Object.values(QUESTIONS).flat();
    return shuffleArray(allQuestions).slice(0, count);
  }
  return shuffleArray([...pool]).slice(0, Math.min(count, pool.length));
}

// Shuffle array
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = {
  name: 'trivia',
  description: 'Start a trivia game',
  category: 'misc',
  usage: '!trivia [category] [rounds]',
  aliases: ['quiz'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    const channelId = message.channel.id;

    // Check if game already running
    if (activeGames.has(channelId)) {
      return message.reply('A trivia game is already running in this channel.');
    }

    // Parse arguments
    let category = 'random';
    let rounds = 5;

    if (args.length > 0) {
      const firstArg = args[0].toLowerCase();
      const validCategories = ['general', 'science', 'history', 'geography', 'entertainment', 'sports', 'technology', 'random'];
      
      if (validCategories.includes(firstArg)) {
        category = firstArg;
        if (args[1]) {
          const parsedRounds = parseInt(args[1]);
          if (!isNaN(parsedRounds)) {
            rounds = Math.min(Math.max(parsedRounds, 1), 20);
          }
        }
      } else {
        const parsedRounds = parseInt(firstArg);
        if (!isNaN(parsedRounds)) {
          rounds = Math.min(Math.max(parsedRounds, 1), 20);
        }
      }
    }

    // Get questions
    let questions;
    if (category === 'random') {
      const allQuestions = Object.values(QUESTIONS).flat();
      questions = shuffleArray(allQuestions).slice(0, rounds);
    } else {
      questions = getRandomQuestions(category, rounds);
    }

    if (questions.length === 0) {
      return message.reply('No questions available for this category.');
    }

    // Adjust rounds to available questions
    rounds = Math.min(rounds, questions.length);

    // Send start embed
    const startEmbed = new EmbedBuilder()
      .setColor('#3b82f6')
      .setTitle('Trivia Game Starting')
      .addFields(
        { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1), inline: true },
        { name: 'Rounds', value: `${rounds}`, inline: true },
        { name: 'Time per Question', value: '15 seconds', inline: true }
      )
      .setDescription('Type **join** to participate in the next 10 seconds.')
      .setFooter({ text: 'Get ready' })
      .setTimestamp();

    const startMsg = await message.channel.send({ embeds: [startEmbed] });

    // Game state
    const gameState = {
      channelId,
      players: new Set(),
      scores: new Map(),
      questions,
      currentRound: 0,
      totalRounds: rounds,
      category,
      answeredThisRound: new Set(),
    };

    activeGames.set(channelId, gameState);

    // Collector for join phase
    const joinFilter = m => m.content.toLowerCase() === 'join' && !m.author.bot;
    const joinCollector = message.channel.createMessageCollector({ filter: joinFilter, time: 10000 });

    joinCollector.on('collect', m => {
      if (!gameState.players.has(m.author.id)) {
        gameState.players.add(m.author.id);
        gameState.scores.set(m.author.id, {
          points: 0,
          correct: 0,
          total: 0,
          username: m.author.username
        });
        m.react('✅').catch(() => {});
      }
    });

    // Start game after 10 seconds
    setTimeout(async () => {
      joinCollector.stop();

      if (gameState.players.size === 0) {
        activeGames.delete(channelId);
        return message.channel.send('No one joined the trivia game. Game cancelled.');
      }

      await startRound(client, message.channel, gameState);
    }, 10000);
  },
};

// Start a round
async function startRound(client, channel, gameState) {
  gameState.currentRound++;
  gameState.answeredThisRound.clear();

  const question = gameState.questions[gameState.currentRound - 1];

  const questionEmbed = new EmbedBuilder()
    .setColor('#3b82f6')
    .setTitle(`Round ${gameState.currentRound} / ${gameState.totalRounds}`)
    .setDescription(question.q)
    .addFields(
      { name: 'A', value: question.options[0], inline: true },
      { name: 'B', value: question.options[1], inline: true },
      { name: 'C', value: question.options[2], inline: true },
      { name: 'D', value: question.options[3], inline: true }
    )
    .setFooter({ text: 'You have 15 seconds to answer' })
    .setTimestamp();

  await channel.send({ embeds: [questionEmbed] });

  // Answer collector
  const answerFilter = m => {
    const content = m.content.toUpperCase();
    return ['A', 'B', 'C', 'D'].includes(content) && 
           gameState.players.has(m.author.id) && 
           !gameState.answeredThisRound.has(m.author.id) &&
           !m.author.bot;
  };

  const answerCollector = channel.createMessageCollector({ filter: answerFilter, time: 15000 });

  answerCollector.on('collect', m => {
    const userId = m.author.id;
    const answer = m.content.toUpperCase();

    gameState.answeredThisRound.add(userId);

    const playerStats = gameState.scores.get(userId);
    playerStats.total++;

    if (answer === question.a) {
      playerStats.points++;
      playerStats.correct++;
      m.react('✅').catch(() => {});
    } else {
      m.react('❌').catch(() => {});
    }

    gameState.scores.set(userId, playerStats);
  });

  // After 15 seconds, show results
  setTimeout(async () => {
    answerCollector.stop();

    const correctPlayers = [];
    for (const [userId, stats] of gameState.scores.entries()) {
      if (gameState.answeredThisRound.has(userId)) {
        const lastCorrect = stats.correct;
        const currentCorrect = gameState.scores.get(userId).correct;
        if (currentCorrect > lastCorrect || (gameState.currentRound === 1 && currentCorrect > 0)) {
          correctPlayers.push(`<@${userId}>`);
        }
      }
    }

    // Calculate who answered correctly this round
    const correctThisRound = [];
    for (const userId of gameState.answeredThisRound) {
      const stats = gameState.scores.get(userId);
      // Check if they gained a point this round
      if (stats.correct > 0 || stats.points > 0) {
        // Simple check: if they answered and have points, they were correct
        correctThisRound.push(`<@${userId}>`);
      }
    }

    const resultEmbed = new EmbedBuilder()
      .setColor('#22c55e')
      .setTitle('Correct Answer')
      .addFields(
        { name: 'Answer', value: `${question.a}: ${question.options[question.a.charCodeAt(0) - 65]}`, inline: false },
        { name: 'Correct Players', value: correctThisRound.length > 0 ? correctThisRound.join(', ') : 'No one answered correctly', inline: false }
      )
      .setFooter({ text: gameState.currentRound < gameState.totalRounds ? 'Next round starting soon' : 'Game ending' })
      .setTimestamp();

    await channel.send({ embeds: [resultEmbed] });

    // Continue or end game
    if (gameState.currentRound < gameState.totalRounds) {
      setTimeout(() => startRound(client, channel, gameState), 3000);
    } else {
      setTimeout(() => endGame(channel, gameState), 2000);
    }
  }, 15000);
}

// End game and show results
async function endGame(channel, gameState) {
  // Sort players by score
  const sortedPlayers = Array.from(gameState.scores.entries())
    .sort((a, b) => b[1].points - a[1].points);

  let resultsText = '';
  
  const topThree = sortedPlayers.slice(0, 3);
  const medals = ['1st Place', '2nd Place', '3rd Place'];

  for (let i = 0; i < topThree.length; i++) {
    const [userId, stats] = topThree[i];
    const accuracy = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(1) : '0.0';
    resultsText += `**${medals[i]}:** <@${userId}>\nPoints: ${stats.points} | Accuracy: ${accuracy}%\n\n`;
  }

  if (resultsText === '') {
    resultsText = 'No players scored any points.';
  }

  const finalEmbed = new EmbedBuilder()
    .setColor('#3b82f6')
    .setTitle('Trivia Results')
    .setDescription(resultsText)
    .addFields(
      { name: 'Total Questions', value: `${gameState.totalRounds}`, inline: true },
      { name: 'Total Players', value: `${gameState.players.size}`, inline: true }
    )
    .setFooter({ text: 'Thanks for playing' })
    .setTimestamp();

  await channel.send({ embeds: [finalEmbed] });

  // Clean up
  activeGames.delete(gameState.channelId);
}