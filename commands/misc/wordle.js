// commands/misc/wordle.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

const GAME_MODES = {
  classic: {
    name: 'Classic',
    description: 'Standard Wordle rules',
    wordLength: 5,
    attempts: 6
  },
  hard: {
    name: 'Hard Mode',
    description: 'Revealed letters must be used in future guesses',
    wordLength: 5,
    attempts: 6
  },
  speed: {
    name: 'Speed Mode',
    description: 'Fewer attempts and time pressure',
    wordLength: 5,
    attempts: 4
  },
  blind: {
    name: 'Blind Mode',
    description: 'Only see how many letters are correct',
    wordLength: 5,
    attempts: 6
  },
  chaos: {
    name: 'Chaos Mode',
    description: 'The target word may change mid-game',
    wordLength: 5,
    attempts: 6
  }
};

const WORD_LIST = [
  'about', 'above', 'abuse', 'actor', 'acute', 'admit', 'adopt', 'adult', 'after', 'again',
  'agent', 'agree', 'ahead', 'alarm', 'album', 'alert', 'alien', 'align', 'alike', 'alive',
  'allow', 'alone', 'along', 'alter', 'amber', 'amend', 'among', 'angel', 'anger', 'angle',
  'angry', 'apart', 'apple', 'apply', 'arena', 'argue', 'arise', 'array', 'arrow', 'aside',
  'asset', 'audio', 'audit', 'avoid', 'awake', 'award', 'aware', 'badly', 'baker', 'bases',
  'basic', 'basis', 'beach', 'began', 'begin', 'begun', 'being', 'below', 'bench', 'billy',
  'birth', 'black', 'blade', 'blame', 'bland', 'blank', 'blast', 'bleed', 'bless', 'blind',
  'block', 'blood', 'bloom', 'blown', 'blues', 'board', 'boost', 'booth', 'bound', 'brain',
  'brand', 'brass', 'brave', 'bread', 'break', 'breed', 'brief', 'bring', 'broad', 'broke',
  'brown', 'build', 'built', 'buyer', 'cable', 'calif', 'candy', 'cargo', 'carry', 'catch',
  'cause', 'chain', 'chair', 'chaos', 'charm', 'chase', 'cheap', 'check', 'chest', 'chief',
  'child', 'china', 'chose', 'civil', 'claim', 'class', 'clean', 'clear', 'click', 'climb',
  'clock', 'close', 'coach', 'coast', 'could', 'count', 'court', 'cover', 'crack', 'craft',
  'crash', 'crazy', 'cream', 'crime', 'cross', 'crowd', 'crown', 'crude', 'curve', 'cycle',
  'daily', 'dance', 'dated', 'dealt', 'death', 'debut', 'delay', 'depth', 'doing', 'doubt',
  'dozen', 'draft', 'drama', 'drank', 'drawn', 'dream', 'dress', 'drill', 'drink', 'drive',
  'drove', 'dying', 'eager', 'early', 'earth', 'eight', 'elite', 'empty', 'enemy', 'enjoy',
  'enter', 'entry', 'equal', 'error', 'event', 'every', 'exact', 'exist', 'extra', 'faith',
  'false', 'fault', 'fiber', 'field', 'fifth', 'fifty', 'fight', 'final', 'first', 'fixed',
  'flash', 'fleet', 'floor', 'fluid', 'focus', 'force', 'forth', 'forty', 'forum', 'found',
  'frame', 'frank', 'fraud', 'fresh', 'front', 'fruit', 'fully', 'funny', 'giant', 'given',
  'glass', 'globe', 'going', 'grace', 'grade', 'grand', 'grant', 'grass', 'grave', 'great',
  'green', 'gross', 'group', 'grown', 'guard', 'guess', 'guest', 'guide', 'guild', 'happy',
  'harry', 'heart', 'heavy', 'hence', 'henry', 'horse', 'hotel', 'house', 'human', 'ideal',
  'image', 'index', 'inner', 'input', 'issue', 'japan', 'jimmy', 'joint', 'jones', 'judge',
  'known', 'label', 'large', 'laser', 'later', 'laugh', 'layer', 'learn', 'lease', 'least',
  'leave', 'legal', 'lemon', 'level', 'lewis', 'light', 'limit', 'links', 'lives', 'local',
  'logic', 'loose', 'lower', 'lucky', 'lunch', 'lying', 'magic', 'major', 'maker', 'march',
  'maria', 'match', 'maybe', 'mayor', 'meant', 'media', 'metal', 'might', 'minor', 'minus',
  'mixed', 'model', 'money', 'month', 'moral', 'motor', 'mount', 'mouse', 'mouth', 'movie',
  'music', 'needs', 'never', 'newly', 'night', 'noise', 'north', 'noted', 'novel', 'nurse',
  'occur', 'ocean', 'offer', 'often', 'order', 'other', 'ought', 'paint', 'panel', 'paper',
  'party', 'peace', 'peter', 'phase', 'phone', 'photo', 'piece', 'pilot', 'pitch', 'place',
  'plain', 'plane', 'plant', 'plate', 'point', 'pound', 'power', 'press', 'price', 'pride',
  'prime', 'print', 'prior', 'prize', 'proof', 'proud', 'prove', 'queen', 'quick', 'quiet',
  'quite', 'radio', 'raise', 'range', 'rapid', 'ratio', 'reach', 'ready', 'refer', 'right',
  'river', 'robin', 'roger', 'roman', 'rough', 'round', 'route', 'royal', 'rural', 'scale',
  'scene', 'scope', 'score', 'sense', 'serve', 'seven', 'shall', 'shape', 'share', 'sharp',
  'sheet', 'shelf', 'shell', 'shift', 'shine', 'shirt', 'shock', 'shoot', 'short', 'shown',
  'sight', 'since', 'sixth', 'sixty', 'sized', 'skill', 'sleep', 'slide', 'small', 'smart',
  'smile', 'smith', 'smoke', 'solid', 'solve', 'sorry', 'sound', 'south', 'space', 'spare',
  'speak', 'speed', 'spend', 'spent', 'split', 'spoke', 'sport', 'staff', 'stage', 'stake',
  'stand', 'start', 'state', 'steam', 'steel', 'stick', 'still', 'stock', 'stone', 'stood',
  'store', 'storm', 'story', 'strip', 'stuck', 'study', 'stuff', 'style', 'sugar', 'suite',
  'super', 'sweet', 'table', 'taken', 'taste', 'taxes', 'teach', 'terry', 'texas', 'thank',
  'theft', 'their', 'theme', 'there', 'these', 'thick', 'thing', 'think', 'third', 'those',
  'three', 'threw', 'throw', 'tight', 'times', 'title', 'today', 'topic', 'total', 'touch',
  'tough', 'tower', 'track', 'trade', 'train', 'treat', 'trend', 'trial', 'tribe', 'trick',
  'tried', 'tries', 'troop', 'truck', 'truly', 'trust', 'truth', 'twice', 'under', 'undue',
  'union', 'unity', 'until', 'upper', 'upset', 'urban', 'usage', 'usual', 'valid', 'value',
  'video', 'virus', 'visit', 'vital', 'vocal', 'voice', 'waste', 'watch', 'water', 'wheel',
  'where', 'which', 'while', 'white', 'whole', 'whose', 'woman', 'women', 'world', 'worry',
  'worse', 'worst', 'worth', 'would', 'wound', 'write', 'wrong', 'wrote', 'young', 'youth'
];

const GUESS_COOLDOWN = 2000; // 2 seconds
const INACTIVITY_TIMEOUT = 300000; // 5 minutes

// Active sessions
const activeSessions = new Map();
const inputCollectors = new Map();
const lastGuessTime = new Map();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function selectWord() {
  return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
}

function validateGuess(guess, session) {
  const { modeConfig } = session;

  if (guess.length !== modeConfig.wordLength) {
    return { valid: false, reason: `Word must be exactly ${modeConfig.wordLength} letters long.` };
  }

  if (!WORD_LIST.includes(guess)) {
    return { valid: false, reason: 'Not a valid word in the dictionary.' };
  }

  // Hard mode validation
  if (session.mode === 'hard') {
    const { revealedConstraints } = session;

    for (const [pos, letter] of Object.entries(revealedConstraints.positions)) {
      if (guess[pos] !== letter) {
        return { valid: false, reason: `Letter '${letter.toUpperCase()}' must be in position ${parseInt(pos) + 1}.` };
      }
    }

    for (const letter of revealedConstraints.present) {
      if (!guess.includes(letter)) {
        return { valid: false, reason: `Guess must contain the letter '${letter.toUpperCase()}'.` };
      }
    }
  }

  return { valid: true };
}

function processGuess(guess, session) {
  const { targetWord, mode } = session;
  const feedback = [];
  const targetLetters = targetWord.split('');
  const guessLetters = guess.split('');
  const letterCounts = {};

  for (const letter of targetLetters) {
    letterCounts[letter] = (letterCounts[letter] || 0) + 1;
  }

  // Mark correct positions
  for (let i = 0; i < guessLetters.length; i++) {
    if (guessLetters[i] === targetLetters[i]) {
      feedback[i] = 'correct';
      letterCounts[guessLetters[i]]--;
      
      if (mode === 'hard') {
        session.revealedConstraints.correct.add(guessLetters[i]);
        session.revealedConstraints.positions[i] = guessLetters[i];
      }
    }
  }

  // Mark present and absent
  for (let i = 0; i < guessLetters.length; i++) {
    if (feedback[i] === 'correct') continue;

    if (targetLetters.includes(guessLetters[i]) && letterCounts[guessLetters[i]] > 0) {
      feedback[i] = 'present';
      letterCounts[guessLetters[i]]--;
      
      if (mode === 'hard') {
        session.revealedConstraints.present.add(guessLetters[i]);
      }
    } else {
      feedback[i] = 'absent';
    }
  }

  return {
    word: guess,
    feedback,
    correct: guess === targetWord
  };
}

function getBlindFeedback(guess, targetWord) {
  let correctCount = 0;
  const targetLetters = targetWord.split('');
  const guessLetters = guess.split('');

  for (let i = 0; i < guessLetters.length; i++) {
    if (targetLetters.includes(guessLetters[i])) {
      correctCount++;
    }
  }

  return correctCount;
}

function buildGrid(session) {
  const { guesses, modeConfig, mode, targetWord } = session;
  const wordLength = modeConfig.wordLength;
  const maxAttempts = modeConfig.attempts;

  let grid = '```\n';

  if (mode === 'blind') {
    for (let i = 0; i < guesses.length; i++) {
      const guess = guesses[i];
      const correctCount = getBlindFeedback(guess.word, targetWord);
      grid += `${guess.word.toUpperCase()}  [${correctCount}/${wordLength} letters]\n`;
    }
  } else {
    for (let i = 0; i < guesses.length; i++) {
      const guess = guesses[i];
      let row = '';
      
      for (let j = 0; j < guess.word.length; j++) {
        const letter = guess.word[j].toUpperCase();
        const status = guess.feedback[j];

        if (status === 'correct') {
          row += `■${letter}`;
        } else if (status === 'present') {
          row += `▪${letter}`;
        } else {
          row += `□${letter}`;
        }
      }
      grid += row + '\n';
    }
  }

  const emptyRows = maxAttempts - guesses.length;
  for (let i = 0; i < emptyRows; i++) {
    grid += '_'.repeat(wordLength * 2) + '\n';
  }

  grid += '```';

  if (mode !== 'blind') {
    grid += '\n`■ = Correct  ▪ = Present  □ = Absent`';
  }

  return grid;
}

function createEmbed(session, statusText = '', gameEnded = false) {
  const { mode, modeConfig, attempts, guesses } = session;
  
  let color = '#3498db';
  
  if (!gameEnded) {
    const progress = guesses.length / modeConfig.attempts;
    if (progress < 0.33) {
      color = '#2ecc71';
    } else if (progress < 0.66) {
      color = '#f39c12';
    } else {
      color = '#e74c3c';
    }
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Wordle - ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`)
    .setDescription(buildGrid(session))
    .addFields(
      { name: 'Attempts Remaining', value: `${attempts}/${modeConfig.attempts}`, inline: true },
      { name: 'Word Length', value: `${modeConfig.wordLength} letters`, inline: true }
    )
    .setTimestamp();

  if (statusText) {
    embed.setFooter({ text: statusText });
  } else {
    embed.setFooter({ text: 'Click Submit Guess to continue' });
  }

  return embed;
}

// ============================================================================
// GAME LOGIC
// ============================================================================

async function startGame(client, message, userId, modeName) {
  const mode = GAME_MODES[modeName];
  const targetWord = selectWord();

  const session = {
    userId,
    channelId: message.channel.id,
    targetWord,
    guesses: [],
    mode: modeName,
    modeConfig: mode,
    attempts: mode.attempts,
    startTime: Date.now(),
    lastActivity: Date.now(),
    gameMessage: null,
    awaitingInput: false,
    chaosChanges: 0,
    revealedConstraints: { correct: new Set(), present: new Set(), positions: {} }
  };

  const embed = createEmbed(session);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wordle_guess:${userId}`)
      .setLabel('Submit Guess')
      .setStyle(ButtonStyle.Primary)
  );

  const gameMessage = await message.channel.send({ embeds: [embed], components: [row] });
  session.gameMessage = gameMessage;

  activeSessions.set(userId, session);

  session.timeoutId = setTimeout(() => {
    endGame(client, session, 'timeout');
  }, INACTIVITY_TIMEOUT);

  const collector = gameMessage.createMessageComponentCollector({
    filter: (i) => i.customId === `wordle_guess:${userId}` && i.user.id === userId,
    time: INACTIVITY_TIMEOUT
  });

  collector.on('collect', async (interaction) => {
    await handleGuessButton(client, interaction, session);
  });

  collector.on('end', () => {
    if (activeSessions.has(userId)) {
      endGame(client, session, 'timeout');
    }
  });
}

async function handleGuessButton(client, interaction, session) {
  const userId = session.userId;

  const now = Date.now();
  const lastGuess = lastGuessTime.get(userId) || 0;
  if (now - lastGuess < GUESS_COOLDOWN) {
    const timeLeft = Math.ceil((GUESS_COOLDOWN - (now - lastGuess)) / 1000);
    return interaction.reply({ content: `Please wait ${timeLeft}s before submitting another guess.`, ephemeral: true });
  }

  if (session.awaitingInput) {
    return interaction.reply({ content: 'Already waiting for your guess! Type a word in chat.', ephemeral: true });
  }

  session.awaitingInput = true;
  await interaction.reply({ content: `Type your ${session.modeConfig.wordLength}-letter guess now:`, ephemeral: true });

  const filter = (m) => m.author.id === userId && m.channel.id === session.channelId;
  const msgCollector = interaction.channel.createMessageCollector({ filter, max: 1, time: 30000 });

  inputCollectors.set(userId, msgCollector);

  msgCollector.on('collect', async (msg) => {
    await processGuessInput(client, session, msg);
  });

  msgCollector.on('end', (collected) => {
    session.awaitingInput = false;
    inputCollectors.delete(userId);
    
    if (collected.size === 0) {
      interaction.followUp({ content: 'Guess timeout. Click the button again to try.', ephemeral: true }).catch(() => {});
    }
  });
}

async function processGuessInput(client, session, msg) {
  const userId = session.userId;
  const guess = msg.content.toLowerCase().trim();

  await msg.delete().catch(() => {});

  const validation = validateGuess(guess, session);
  
  if (!validation.valid) {
    const embed = createEmbed(session, validation.reason);
    await session.gameMessage.edit({ embeds: [embed] });
    return;
  }

  lastGuessTime.set(userId, Date.now());

  if (session.guesses.some(g => g.word === guess)) {
    const embed = createEmbed(session, 'You already guessed that word!');
    await session.gameMessage.edit({ embeds: [embed] });
    return;
  }

  const result = processGuess(guess, session);
  session.guesses.push(result);
  session.attempts--;
  session.lastActivity = Date.now();

  clearTimeout(session.timeoutId);
  session.timeoutId = setTimeout(() => {
    endGame(client, session, 'timeout');
  }, INACTIVITY_TIMEOUT);

  if (result.correct) {
    return endGame(client, session, 'win');
  }

  if (session.attempts <= 0) {
    return endGame(client, session, 'loss');
  }

  // Chaos mode
  if (session.mode === 'chaos' && session.guesses.length === 3 && session.chaosChanges === 0) {
    session.targetWord = selectWord();
    session.chaosChanges++;
    const embed = createEmbed(session, '⚠️ CHAOS SHIFT! The word changed...');
    await session.gameMessage.edit({ embeds: [embed] });
    return;
  }

  const embed = createEmbed(session);
  await session.gameMessage.edit({ embeds: [embed] });
}

async function endGame(client, session, endType) {
  const userId = session.userId;

  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }

  const collector = inputCollectors.get(userId);
  if (collector) {
    collector.stop();
    inputCollectors.delete(userId);
  }

  let statusText = '';
  let color = '#95a5a6';

  if (endType === 'win') {
    statusText = `Correct! The word was ${session.targetWord.toUpperCase()}\nGuessed in ${session.guesses.length}/${session.modeConfig.attempts} attempts`;
    color = '#2ecc71';
  } else if (endType === 'loss') {
    statusText = `Game Over! The word was ${session.targetWord.toUpperCase()}`;
    color = '#e74c3c';
  } else if (endType === 'timeout') {
    statusText = `Game timed out. The word was ${session.targetWord.toUpperCase()}`;
    color = '#95a5a6';
  } else if (endType === 'forfeit') {
    statusText = `Game forfeited. The word was ${session.targetWord.toUpperCase()}`;
    color = '#95a5a6';
  }

  const embed = createEmbed(session, statusText, true);
  embed.setColor(color);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wordle_guess:${userId}`)
      .setLabel('Game Ended')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  await session.gameMessage.edit({ embeds: [embed], components: [row] }).catch(() => {});

  activeSessions.delete(userId);
}

// ============================================================================
// MAIN COMMAND EXPORT
// ============================================================================

module.exports = {
  name: 'wordle',
  description: 'Play Wordle - guess the hidden word',
  category: 'misc',
  usage: 'wordle [mode] | wordle modes | wordle stop',
  aliases: ['wl'],
  
  async execute(client, message, args) {
    const userId = message.author.id;
    const subcommand = args[0]?.toLowerCase();

    // Show modes
    if (subcommand === 'modes') {
      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('Wordle Game Modes')
        .setDescription('Available game modes:')
        .addFields(
          { name: 'Classic', value: 'Standard Wordle rules\n6 attempts, 5 letters', inline: true },
          { name: 'Hard', value: 'Revealed letters must be used\n6 attempts, 5 letters', inline: true },
          { name: 'Speed', value: 'Race against time!\n4 attempts, 5 letters', inline: true },
          { name: 'Blind', value: 'Only see correct letter count\n6 attempts, 5 letters', inline: true },
          { name: 'Chaos', value: 'Word changes mid-game!\n6 attempts, 5 letters', inline: true }
        )
        .setFooter({ text: 'Usage: wordle [mode]' });

      return message.reply({ embeds: [embed] });
    }

    // Stop game
    if (subcommand === 'stop') {
      const session = activeSessions.get(userId);
      
      if (!session) {
        return message.reply('You don\'t have an active Wordle game.');
      }

      endGame(client, session, 'forfeit');
      return message.reply('Game forfeited.');
    }

    // Check if already playing
    if (activeSessions.has(userId)) {
      return message.reply('You already have an active Wordle game! Use `wordle stop` to forfeit it.');
    }

    // Start game
    const mode = subcommand || 'classic';
    
    if (!GAME_MODES[mode]) {
      return message.reply(`Invalid mode. Use \`wordle modes\` to see available modes.`);
    }

    await startGame(client, message, userId, mode);
  }
};
