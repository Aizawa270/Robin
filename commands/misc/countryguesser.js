// commands/misc/countryguesser.js
const { EmbedBuilder } = require('discord.js');

// Country data by continent with codes
const COUNTRIES = {
  africa: [
    { name: 'Algeria', code: 'dz', aliases: [] },
    { name: 'Angola', code: 'ao', aliases: [] },
    { name: 'Benin', code: 'bj', aliases: [] },
    { name: 'Botswana', code: 'bw', aliases: [] },
    { name: 'Burkina Faso', code: 'bf', aliases: ['burkina'] },
    { name: 'Burundi', code: 'bi', aliases: [] },
    { name: 'Cameroon', code: 'cm', aliases: [] },
    { name: 'Cape Verde', code: 'cv', aliases: ['cabo verde'] },
    { name: 'Central African Republic', code: 'cf', aliases: ['car', 'central african'] },
    { name: 'Chad', code: 'td', aliases: [] },
    { name: 'Comoros', code: 'km', aliases: [] },
    { name: 'Congo', code: 'cg', aliases: ['republic of congo', 'congo brazzaville'] },
    { name: 'Democratic Republic of the Congo', code: 'cd', aliases: ['drc', 'dr congo', 'congo kinshasa'] },
    { name: 'Djibouti', code: 'dj', aliases: [] },
    { name: 'Egypt', code: 'eg', aliases: [] },
    { name: 'Equatorial Guinea', code: 'gq', aliases: [] },
    { name: 'Eritrea', code: 'er', aliases: [] },
    { name: 'Eswatini', code: 'sz', aliases: ['swaziland'] },
    { name: 'Ethiopia', code: 'et', aliases: [] },
    { name: 'Gabon', code: 'ga', aliases: [] },
    { name: 'Gambia', code: 'gm', aliases: ['the gambia'] },
    { name: 'Ghana', code: 'gh', aliases: [] },
    { name: 'Guinea', code: 'gn', aliases: [] },
    { name: 'Guinea-Bissau', code: 'gw', aliases: ['guinea bissau'] },
    { name: 'Ivory Coast', code: 'ci', aliases: ['cote divoire', 'côte d\'ivoire'] },
    { name: 'Kenya', code: 'ke', aliases: [] },
    { name: 'Lesotho', code: 'ls', aliases: [] },
    { name: 'Liberia', code: 'lr', aliases: [] },
    { name: 'Libya', code: 'ly', aliases: [] },
    { name: 'Madagascar', code: 'mg', aliases: [] },
    { name: 'Malawi', code: 'mw', aliases: [] },
    { name: 'Mali', code: 'ml', aliases: [] },
    { name: 'Mauritania', code: 'mr', aliases: [] },
    { name: 'Mauritius', code: 'mu', aliases: [] },
    { name: 'Morocco', code: 'ma', aliases: [] },
    { name: 'Mozambique', code: 'mz', aliases: [] },
    { name: 'Namibia', code: 'na', aliases: [] },
    { name: 'Niger', code: 'ne', aliases: [] },
    { name: 'Nigeria', code: 'ng', aliases: [] },
    { name: 'Rwanda', code: 'rw', aliases: [] },
    { name: 'Sao Tome and Principe', code: 'st', aliases: ['sao tome', 'são tomé'] },
    { name: 'Senegal', code: 'sn', aliases: [] },
    { name: 'Seychelles', code: 'sc', aliases: [] },
    { name: 'Sierra Leone', code: 'sl', aliases: [] },
    { name: 'Somalia', code: 'so', aliases: [] },
    { name: 'South Africa', code: 'za', aliases: [] },
    { name: 'South Sudan', code: 'ss', aliases: [] },
    { name: 'Sudan', code: 'sd', aliases: [] },
    { name: 'Tanzania', code: 'tz', aliases: [] },
    { name: 'Togo', code: 'tg', aliases: [] },
    { name: 'Tunisia', code: 'tn', aliases: [] },
    { name: 'Uganda', code: 'ug', aliases: [] },
    { name: 'Zambia', code: 'zm', aliases: [] },
    { name: 'Zimbabwe', code: 'zw', aliases: [] }
  ],
  asia: [
    { name: 'Afghanistan', code: 'af', aliases: [] },
    { name: 'Armenia', code: 'am', aliases: [] },
    { name: 'Azerbaijan', code: 'az', aliases: [] },
    { name: 'Bahrain', code: 'bh', aliases: [] },
    { name: 'Bangladesh', code: 'bd', aliases: [] },
    { name: 'Bhutan', code: 'bt', aliases: [] },
    { name: 'Brunei', code: 'bn', aliases: [] },
    { name: 'Cambodia', code: 'kh', aliases: [] },
    { name: 'China', code: 'cn', aliases: [] },
    { name: 'Cyprus', code: 'cy', aliases: [] },
    { name: 'Georgia', code: 'ge', aliases: [] },
    { name: 'India', code: 'in', aliases: [] },
    { name: 'Indonesia', code: 'id', aliases: [] },
    { name: 'Iran', code: 'ir', aliases: [] },
    { name: 'Iraq', code: 'iq', aliases: [] },
    { name: 'Israel', code: 'il', aliases: [] },
    { name: 'Japan', code: 'jp', aliases: [] },
    { name: 'Jordan', code: 'jo', aliases: [] },
    { name: 'Kazakhstan', code: 'kz', aliases: [] },
    { name: 'Kuwait', code: 'kw', aliases: [] },
    { name: 'Kyrgyzstan', code: 'kg', aliases: [] },
    { name: 'Laos', code: 'la', aliases: [] },
    { name: 'Lebanon', code: 'lb', aliases: [] },
    { name: 'Malaysia', code: 'my', aliases: [] },
    { name: 'Maldives', code: 'mv', aliases: [] },
    { name: 'Mongolia', code: 'mn', aliases: [] },
    { name: 'Myanmar', code: 'mm', aliases: ['burma'] },
    { name: 'Nepal', code: 'np', aliases: [] },
    { name: 'North Korea', code: 'kp', aliases: ['dprk'] },
    { name: 'Oman', code: 'om', aliases: [] },
    { name: 'Pakistan', code: 'pk', aliases: [] },
    { name: 'Palestine', code: 'ps', aliases: [] },
    { name: 'Philippines', code: 'ph', aliases: [] },
    { name: 'Qatar', code: 'qa', aliases: [] },
    { name: 'Saudi Arabia', code: 'sa', aliases: [] },
    { name: 'Singapore', code: 'sg', aliases: [] },
    { name: 'South Korea', code: 'kr', aliases: ['korea'] },
    { name: 'Sri Lanka', code: 'lk', aliases: [] },
    { name: 'Syria', code: 'sy', aliases: [] },
    { name: 'Taiwan', code: 'tw', aliases: [] },
    { name: 'Tajikistan', code: 'tj', aliases: [] },
    { name: 'Thailand', code: 'th', aliases: [] },
    { name: 'Timor-Leste', code: 'tl', aliases: ['east timor'] },
    { name: 'Turkey', code: 'tr', aliases: ['türkiye'] },
    { name: 'Turkmenistan', code: 'tm', aliases: [] },
    { name: 'United Arab Emirates', code: 'ae', aliases: ['uae'] },
    { name: 'Uzbekistan', code: 'uz', aliases: [] },
    { name: 'Vietnam', code: 'vn', aliases: [] },
    { name: 'Yemen', code: 'ye', aliases: [] }
  ],
  europe: [
    { name: 'Albania', code: 'al', aliases: [] },
    { name: 'Andorra', code: 'ad', aliases: [] },
    { name: 'Austria', code: 'at', aliases: [] },
    { name: 'Belarus', code: 'by', aliases: [] },
    { name: 'Belgium', code: 'be', aliases: [] },
    { name: 'Bosnia and Herzegovina', code: 'ba', aliases: ['bosnia'] },
    { name: 'Bulgaria', code: 'bg', aliases: [] },
    { name: 'Croatia', code: 'hr', aliases: [] },
    { name: 'Czech Republic', code: 'cz', aliases: ['czechia'] },
    { name: 'Denmark', code: 'dk', aliases: [] },
    { name: 'Estonia', code: 'ee', aliases: [] },
    { name: 'Finland', code: 'fi', aliases: [] },
    { name: 'France', code: 'fr', aliases: [] },
    { name: 'Germany', code: 'de', aliases: [] },
    { name: 'Greece', code: 'gr', aliases: [] },
    { name: 'Hungary', code: 'hu', aliases: [] },
    { name: 'Iceland', code: 'is', aliases: [] },
    { name: 'Ireland', code: 'ie', aliases: [] },
    { name: 'Italy', code: 'it', aliases: [] },
    { name: 'Kosovo', code: 'xk', aliases: [] },
    { name: 'Latvia', code: 'lv', aliases: [] },
    { name: 'Liechtenstein', code: 'li', aliases: [] },
    { name: 'Lithuania', code: 'lt', aliases: [] },
    { name: 'Luxembourg', code: 'lu', aliases: [] },
    { name: 'Malta', code: 'mt', aliases: [] },
    { name: 'Moldova', code: 'md', aliases: [] },
    { name: 'Monaco', code: 'mc', aliases: [] },
    { name: 'Montenegro', code: 'me', aliases: [] },
    { name: 'Netherlands', code: 'nl', aliases: ['holland'] },
    { name: 'North Macedonia', code: 'mk', aliases: ['macedonia'] },
    { name: 'Norway', code: 'no', aliases: [] },
    { name: 'Poland', code: 'pl', aliases: [] },
    { name: 'Portugal', code: 'pt', aliases: [] },
    { name: 'Romania', code: 'ro', aliases: [] },
    { name: 'Russia', code: 'ru', aliases: [] },
    { name: 'San Marino', code: 'sm', aliases: [] },
    { name: 'Serbia', code: 'rs', aliases: [] },
    { name: 'Slovakia', code: 'sk', aliases: [] },
    { name: 'Slovenia', code: 'si', aliases: [] },
    { name: 'Spain', code: 'es', aliases: [] },
    { name: 'Sweden', code: 'se', aliases: [] },
    { name: 'Switzerland', code: 'ch', aliases: [] },
    { name: 'Ukraine', code: 'ua', aliases: [] },
    { name: 'United Kingdom', code: 'gb', aliases: ['uk', 'great britain', 'britain'] },
    { name: 'Vatican City', code: 'va', aliases: ['vatican'] }
  ],
  northamerica: [
    { name: 'Antigua and Barbuda', code: 'ag', aliases: ['antigua'] },
    { name: 'Bahamas', code: 'bs', aliases: ['the bahamas'] },
    { name: 'Barbados', code: 'bb', aliases: [] },
    { name: 'Belize', code: 'bz', aliases: [] },
    { name: 'Canada', code: 'ca', aliases: [] },
    { name: 'Costa Rica', code: 'cr', aliases: [] },
    { name: 'Cuba', code: 'cu', aliases: [] },
    { name: 'Dominica', code: 'dm', aliases: [] },
    { name: 'Dominican Republic', code: 'do', aliases: [] },
    { name: 'El Salvador', code: 'sv', aliases: [] },
    { name: 'Grenada', code: 'gd', aliases: [] },
    { name: 'Guatemala', code: 'gt', aliases: [] },
    { name: 'Haiti', code: 'ht', aliases: [] },
    { name: 'Honduras', code: 'hn', aliases: [] },
    { name: 'Jamaica', code: 'jm', aliases: [] },
    { name: 'Mexico', code: 'mx', aliases: [] },
    { name: 'Nicaragua', code: 'ni', aliases: [] },
    { name: 'Panama', code: 'pa', aliases: [] },
    { name: 'Saint Kitts and Nevis', code: 'kn', aliases: ['st kitts'] },
    { name: 'Saint Lucia', code: 'lc', aliases: ['st lucia'] },
    { name: 'Saint Vincent and the Grenadines', code: 'vc', aliases: ['st vincent'] },
    { name: 'Trinidad and Tobago', code: 'tt', aliases: ['trinidad'] },
    { name: 'United States', code: 'us', aliases: ['usa', 'america', 'united states of america'] }
  ],
  southamerica: [
    { name: 'Argentina', code: 'ar', aliases: [] },
    { name: 'Bolivia', code: 'bo', aliases: [] },
    { name: 'Brazil', code: 'br', aliases: [] },
    { name: 'Chile', code: 'cl', aliases: [] },
    { name: 'Colombia', code: 'co', aliases: [] },
    { name: 'Ecuador', code: 'ec', aliases: [] },
    { name: 'Guyana', code: 'gy', aliases: [] },
    { name: 'Paraguay', code: 'py', aliases: [] },
    { name: 'Peru', code: 'pe', aliases: [] },
    { name: 'Suriname', code: 'sr', aliases: [] },
    { name: 'Uruguay', code: 'uy', aliases: [] },
    { name: 'Venezuela', code: 've', aliases: [] }
  ],
  oceania: [
    { name: 'Australia', code: 'au', aliases: [] },
    { name: 'Fiji', code: 'fj', aliases: [] },
    { name: 'Kiribati', code: 'ki', aliases: [] },
    { name: 'Marshall Islands', code: 'mh', aliases: [] },
    { name: 'Micronesia', code: 'fm', aliases: [] },
    { name: 'Nauru', code: 'nr', aliases: [] },
    { name: 'New Zealand', code: 'nz', aliases: [] },
    { name: 'Palau', code: 'pw', aliases: [] },
    { name: 'Papua New Guinea', code: 'pg', aliases: ['png'] },
    { name: 'Samoa', code: 'ws', aliases: [] },
    { name: 'Solomon Islands', code: 'sb', aliases: [] },
    { name: 'Tonga', code: 'to', aliases: [] },
    { name: 'Tuvalu', code: 'tv', aliases: [] },
    { name: 'Vanuatu', code: 'vu', aliases: [] }
  ]
};

// Active games tracker
const activeGames = new Map();

module.exports = {
  name: 'countryguesser',
  description: 'Guess countries by their flags',
  category: 'misc',
  usage: 'countryguesser <continent> [rounds]',
  aliases: ['cg', 'flaggame', 'guessflag'],
  async execute(client, message, args) {
    if (!message.guild) return;

    // Check if game already running in this channel
    if (activeGames.has(message.channel.id)) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription('A game is already running in this channel!');
      return message.reply({ embeds: [embed] });
    }

    // Parse arguments
    if (!args[0]) {
      const embed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle('Country Guesser')
        .setDescription(
          'Guess countries by their flags!\n\n' +
          '**Usage:**\n' +
          '`countryguesser <continent> [rounds]`\n\n' +
          '**Continents:**\n' +
          '• `africa`\n' +
          '• `asia`\n' +
          '• `europe`\n' +
          '• `northamerica`\n' +
          '• `southamerica`\n' +
          '• `oceania`\n' +
          '• `all` (random from all continents)\n\n' +
          '**Examples:**\n' +
          '`countryguesser europe`\n' +
          '`countryguesser asia 20`\n' +
          '`countryguesser all 30`\n\n' +
          '**Scoring:**\n' +
          '🥇 1st correct answer: **3 points**\n' +
          '🥈 2nd correct answer: **2 points**\n' +
          '🥉 3rd correct answer: **1 point**'
        )
        .setFooter({ text: 'Default: 10 rounds • Max: 30 rounds' });
      return message.reply({ embeds: [embed] });
    }

    const continent = args[0].toLowerCase();
    const validContinents = ['africa', 'asia', 'europe', 'northamerica', 'southamerica', 'oceania', 'all'];

    if (!validContinents.includes(continent)) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription(
          `Invalid continent! Choose from:\n` +
          `\`africa\`, \`asia\`, \`europe\`, \`northamerica\`, \`southamerica\`, \`oceania\`, \`all\``
        );
      return message.reply({ embeds: [embed] });
    }

    // Parse rounds - now just a simple number as second argument
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

    // Get country pool
    let countryPool = [];
    if (continent === 'all') {
      Object.values(COUNTRIES).forEach(countries => {
        countryPool = countryPool.concat(countries);
      });
    } else {
      countryPool = COUNTRIES[continent];
    }

    if (countryPool.length < rounds) {
      rounds = countryPool.length;
    }

    // Start game
    const startEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('A new game will start soon!')
      .setDescription(
        `Will you be able to guess all those countries by their flag?\n\n` +
        `The game will last **${rounds}** round${rounds === 1 ? '' : 's'}.`
      )
      .setFooter({ text: 'Game starts in 3 seconds...' });

    await message.reply({ embeds: [startEmbed] });

    // Mark game as active
    activeGames.set(message.channel.id, true);

    // Wait 3 seconds
    await sleep(3000);

    // Shuffle and select countries
    const shuffled = countryPool.sort(() => Math.random() - 0.5);
    const selectedCountries = shuffled.slice(0, rounds);

    // Game state
    const scores = new Map();
    let currentRound = 0;

    // Start game loop
    for (const country of selectedCountries) {
      currentRound++;

      const questionEmbed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle(`Question ${currentRound} of ${rounds}`)
        .setDescription('To which country does this flag belong?')
        .setImage(`https://flagcdn.com/w640/${country.code}.png`)
        .setFooter({ text: 'You have 10 seconds to answer' });

      const questionMsg = await message.channel.send({ embeds: [questionEmbed] });

      // Collect answers
      const correctAnswers = [country.name.toLowerCase(), ...country.aliases];
      const winners = [];
      const collectedUsers = new Set();
      let resultMessage = null;

      const collector = message.channel.createMessageCollector({
        filter: m => !m.author.bot && !collectedUsers.has(m.author.id),
        time: 10000
      });

      await new Promise((resolve) => {
        collector.on('collect', async (m) => {
          const guess = m.content.toLowerCase().trim();

          if (correctAnswers.includes(guess)) {
            collectedUsers.add(m.author.id);
            winners.push({ user: m.author, message: m });

            // Award points
            let pointsAwarded = 0;
            if (winners.length === 1) {
              pointsAwarded = 3;
              scores.set(m.author.id, (scores.get(m.author.id) || 0) + 3);
            } else if (winners.length === 2) {
              pointsAwarded = 2;
              scores.set(m.author.id, (scores.get(m.author.id) || 0) + 2);
            } else if (winners.length === 3) {
              pointsAwarded = 1;
              scores.set(m.author.id, (scores.get(m.author.id) || 0) + 1);
            }

            // Send/update instant result embed
            const medals = ['🥇', '🥈', '🥉'];
            const winnersText = winners.map((w, i) => {
              const points = [3, 2, 1];
              return `${medals[i]} ${w.user} - **${points[i]} point${points[i] === 1 ? '' : 's'}**`;
            }).join('\n');

            const instantEmbed = new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle(`${winners[0].user.username} got it right!`)
              .setDescription(
                `This flag belongs to **${country.name}**.\n\n` +
                `**Points awarded:**\n${winnersText}\n\n` +
                (currentRound < rounds ? `The game will move on in 5 seconds...` : 'This was the last round.')
              )
              .setFooter({ text: `Round ${currentRound}/${rounds}` });

            // Edit existing result message or send new one
            if (resultMessage) {
              await resultMessage.edit({ embeds: [instantEmbed] }).catch(() => {});
            } else {
              resultMessage = await message.channel.send({ embeds: [instantEmbed] });
            }

            // Stop after 3 winners
            if (winners.length === 3) {
              collector.stop();
            }
          }
        });

        collector.on('end', () => {
          resolve();
        });
      });

      // If no one got it right, send the "no one got it right" embed
      if (winners.length === 0) {
        const resultEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('No one got it right!')
          .setDescription(
            `This flag belongs to **${country.name}**.\n\n` +
            (currentRound < rounds ? `The game will move on in 5 seconds...` : 'This was the last round.')
          )
          .setFooter({ text: `Round ${currentRound}/${rounds}` });

        await message.channel.send({ embeds: [resultEmbed] });
      }

      // Wait 5 seconds before next round
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
        `The game has ended!\n\n` +
        `**These are the winners from this game:**\n\n` +
        leaderboardText
      )
      .setFooter({ text: `${rounds} rounds completed` });

    await message.channel.send({ embeds: [finishEmbed] });

    // Remove from active games
    activeGames.delete(message.channel.id);
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
