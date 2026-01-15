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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription('A trivia game is already running in this channel!');
      return message.reply({ embeds: [embed] });
    }

    // Show help if no args
    if (args.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#3b82f6')
        .setTitle('Trivia Game')
        .setDescription(
          'Test your knowledge with trivia questions!\n\n' +
          '**Usage:**\n' +
          '`trivia <category> [rounds]`\n\n' +
          '**Categories:**\n' +
          '• `general` - General knowledge\n' +
          '• `science` - Science & nature\n' +
          '• `history` - Historical events\n' +
          '• `geography` - World geography\n' +
          '• `entertainment` - Movies, TV & music\n' +
          '• `sports` - Sports trivia\n' +
          '• `technology` - Tech & computers\n' +
          '• `random` - Mix of all categories\n\n' +
          '**Examples:**\n' +
          '`trivia science`\n' +
          '`trivia history 15`\n' +
          '`trivia random 20`\n\n' +
          '**Scoring:**\n' +
          '🥇 1st correct answer: **3 points**\n' +
          '🥈 2nd correct answer: **2 points**\n' +
          '🥉 3rd correct answer: **1 point**'
        )
        .setFooter({ text: 'Default: 5 rounds • Max: 20 rounds' });
      return message.reply({ embeds: [embed] });
    }

    // Parse arguments
    let category = 'random';
    let rounds = 5;

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
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription(
          `Invalid category! Choose from:\n` +
          `\`general\`, \`science\`, \`history\`, \`geography\`, \`entertainment\`, \`sports\`, \`technology\`, \`random\``
        );
      return message.reply({ embeds: [embed] });
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

    rounds = Math.min(rounds, questions.length);

    // Send start embed
    const startEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('A new trivia game will start soon!')
      .setDescription(
        `Will you be able to answer all those questions?\n\n` +
        `The game will last **${rounds}** round${rounds === 1 ? '' : 's'}.`
      )
      .setFooter({ text: 'Game starts in 3 seconds...' });

    await message.reply({ embeds: [startEmbed] });

    // Mark game as active
    activeGames.set(channelId, true);

    // Wait 3 seconds
    await sleep(3000);

    // Game state
    const scores = new Map();
    let currentRound = 0;

    // Start game loop
    for (const question of questions) {
      currentRound++;

      const questionEmbed = new EmbedBuilder()
        .setColor('#3b82f6')
        .setTitle(`Question ${currentRound} of ${rounds}`)
        .setDescription(question.q)
        .addFields(
          { name: '🅰️ A', value: question.options[0], inline: true },
          { name: '🅱️ B', value: question.options[1], inline: true },
          { name: '🆎 C', value: question.options[2], inline: true },
          { name: '🅾️ D', value: question.options[3], inline: true }
        )
        .setFooter({ text: 'You have 15 seconds to answer • Type A, B, C, or D' });

      await message.channel.send({ embeds: [questionEmbed] });

      // Collect answers
      const winners = [];
      const collectedUsers = new Set();

      const collector = message.channel.createMessageCollector({
        filter: m => {
          const content = m.content.toUpperCase();
          return ['A', 'B', 'C', 'D'].includes(content) && 
                 !m.author.bot && 
                 !collectedUsers.has(m.author.id);
        },
        time: 15000
      });

      await new Promise((resolve) => {
        collector.on('collect', async (m) => {
          const answer = m.content.toUpperCase();
          collectedUsers.add(m.author.id);

          if (answer === question.a) {
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
          return `${medals[i]} ${w.user} - **${points[i]} point${points[i] === 1 ? '' : 's'}**`;
        }).join('\n');

        resultEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle(`${winners[0].user.username} got it right!`)
          .setDescription(
            `The correct answer is **${question.a}: ${question.options[question.a.charCodeAt(0) - 65]}**\n\n` +
            `**Points awarded:**\n${winnersText}\n\n` +
            (currentRound < rounds ? `The game will move on in 5 seconds...` : 'This was the last round.')
          )
          .setFooter({ text: `Round ${currentRound}/${rounds}` });
      } else {
        resultEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('No one got it right!')
          .setDescription(
            `The correct answer is **${question.a}: ${question.options[question.a.charCodeAt(0) - 65]}**\n\n` +
            (currentRound < rounds ? `The game will move on in 5 seconds...` : 'This was the last round.')
          )
          .setFooter({ text: `Round ${currentRound}/${rounds}` });
      }

      await message.channel.send({ embeds: [resultEmbed] });

      // Wait before next round
      if (currentRound < rounds) {
        await sleep(5000);
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
        leaderboardText += `${medal} <@${userId}> - ${points} point${points === 1 ? '' : 's'}\n`;
      });
    }

    const finishEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('FINISHED')
      .setDescription(
        `The trivia game has ended!\n\n` +
        `**These are the winners from this game:**\n\n` +
        leaderboardText
      )
      .setFooter({ text: `${rounds} rounds completed` });

    await message.channel.send({ embeds: [finishEmbed] });

    // Clean up
    activeGames.delete(channelId);
  },
};
