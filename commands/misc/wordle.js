// commands/misc/wordle.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

const GAME_MODES = {
  classic: {
    name: 'Classic',
    description: 'Standard Wordle rules',
    emoji: '🎯',
    wordLength: 5,
    attempts: 6,
    color: '#3498db'
  },
  hard: {
    name: 'Hard Mode',
    description: 'Revealed letters must be used',
    emoji: '🔥',
    wordLength: 5,
    attempts: 6,
    color: '#e74c3c'
  },
  speed: {
    name: 'Speed Mode',
    description: 'Fast-paced challenge',
    emoji: '⚡',
    wordLength: 5,
    attempts: 4,
    color: '#f39c12'
  },
  blind: {
    name: 'Blind Mode',
    description: 'Only see correct count',
    emoji: '🔮',
    wordLength: 5,
    attempts: 6,
    color: '#9b59b6'
  },
  chaos: {
    name: 'Chaos Mode',
    description: 'Word changes mid-game',
    emoji: '🌀',
    wordLength: 5,
    attempts: 6,
    color: '#e67e22'
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
  'worse', 'worst', 'worth', 'would', 'wound', 'write', 'wrong', 'wrote', 'young', 'youth',
  // Extra words
  'beach', 'bench', 'berry', 'blend', 'blink', 'bonus', 'brake', 'brick', 'bride', 'brush',
  'burst', 'cabin', 'camel', 'canal', 'comet', 'coral', 'couch', 'coupon', 'crane', 'crate',
  'creek', 'crisp', 'cuddle', 'daisy', 'delta', 'demon', 'denim', 'diary', 'disco', 'diver',
  'dragon', 'dwarf', 'eagle', 'eclipse', 'ember', 'evoke', 'exile', 'fable', 'fairy', 'fancy',
  'feast', 'fence', 'fever', 'flame', 'flask', 'flock', 'flour', 'flute', 'forge', 'fossil',
  'frost', 'gamer', 'gauge', 'gecko', 'ghost', 'giant', 'glide', 'glove', 'gnome', 'goose',
  'gorge', 'grape', 'grasp', 'greed', 'grief', 'grill', 'grind', 'groan', 'grove', 'growl',
  'grunt', 'guild', 'hazel', 'helix', 'hinge', 'hoist', 'honey', 'hover', 'hyena', 'hyper',
  'inlet', 'ivory', 'jewel', 'joker', 'jolly', 'joust', 'karma', 'kayak', 'knife', 'koala',
  'label', 'lance', 'laser', 'latch', 'latte', 'ledge', 'leech', 'lemon', 'lilac', 'linen',
  'lotus', 'lunar', 'mango', 'manor', 'maple', 'marble', 'marsh', 'melon', 'merge', 'metro',
  'mixer', 'mocha', 'moist', 'molar', 'moose', 'mosaic', 'motto', 'mummy', 'mural', 'nacho',
  'nanny', 'niche', 'ninja', 'noble', 'nomad', 'notch', 'nudge', 'nylon', 'oasis', 'obese',
  'ocean', 'olive', 'onion', 'orbit', 'otter', 'oxide', 'panda', 'panic', 'paste', 'patch',
  'peach', 'pearl', 'pedal', 'penny', 'perch', 'piano', 'plaza', 'plumb', 'plume', 'poker',
  'polar', 'porch', 'pouch', 'prawn', 'proxy', 'prune', 'pulse', 'pupil', 'quake', 'quart',
  'quilt', 'quota', 'radar', 'ranch', 'raven', 'razor', 'rebel', 'recon', 'reign', 'relay',
  'remix', 'retro', 'rhino', 'ridge', 'rival', 'roast', 'robot', 'rocky', 'rogue', 'rouge',
  'rupee', 'rusty', 'saber', 'salad', 'salon', 'salsa', 'sandy', 'satin', 'sauce', 'sauna',
  'scarf', 'scoop', 'scout', 'scrap', 'serum', 'shade', 'shale', 'shank', 'shard', 'shark',
  'shawl', 'shear', 'shine', 'shiny', 'shire', 'shore', 'shred', 'shrub', 'siege', 'sigma',
  'siren', 'skate', 'skull', 'slash', 'slate', 'sleet', 'slime', 'sloth', 'smash', 'snack',
  'snake', 'snare', 'sneak', 'sniff', 'snore', 'snout', 'solar', 'sonic', 'soothe', 'spark',
  'spawn', 'spear', 'spice', 'spike', 'spine', 'spiral', 'spite', 'splat', 'split', 'spook',
  'spoon', 'spray', 'squad', 'squid', 'stair', 'stale', 'stall', 'stamp', 'stash', 'steak',
  'sting', 'stink', 'stomp', 'stool', 'stray', 'strip', 'stunt', 'swamp', 'swear', 'sweat',
  'sweep', 'swift', 'swine', 'swing', 'swirl', 'sword', 'syrup', 'talon', 'tango', 'tarot',
  'taunt', 'tempo', 'thorn', 'thumb', 'tiger', 'tilde', 'tithe', 'toast', 'token', 'tonic',
  'torch', 'totem', 'toxic', 'trace', 'tract', 'trait', 'trash', 'tread', 'treat', 'trek',
  'trench', 'tribe', 'troll', 'truce', 'trunk', 'tulip', 'tumor', 'tunic', 'turbo', 'tutor',
  'tweak', 'tweet', 'twerp', 'twist', 'ultra', 'umbra', 'uncle', 'unity', 'usher', 'vault',
  'vegan', 'venom', 'venue', 'verse', 'vigor', 'villa', 'vinyl', 'viper', 'viral', 'vista',
  'vibes', 'vodka', 'vogue', 'volley', 'voter', 'vowel', 'vroom', 'wafer', 'wager', 'wagon',
  'waltz', 'wheat', 'whiff', 'whine', 'whisk', 'widow', 'wield', 'witch', 'woken', 'wrath',
  'wreck', 'wrist', 'yacht', 'yeast', 'yield', 'zebra', 'zesty', 'zones'
];

const INACTIVITY_TIMEOUT = 300000; // 5 minutes

// Active sessions
const activeSessions = new Map();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function selectWord() {
  return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
}

function validateGuess(guess, session) {
  const { modeConfig } = session;

  if (guess.length !== modeConfig.wordLength) {
    return { valid: false, reason: `Must be ${modeConfig.wordLength} letters` };
  }

  if (!WORD_LIST.includes(guess)) {
    return { valid: false, reason: 'Not in word list' };
  }

  // Hard mode validation
  if (session.mode === 'hard') {
    const { revealedConstraints } = session;

    for (const [pos, letter] of Object.entries(revealedConstraints.positions)) {
      if (guess[pos] !== letter) {
        return { valid: false, reason: `${letter.toUpperCase()} must be in position ${parseInt(pos) + 1}` };
      }
    }

    for (const letter of revealedConstraints.present) {
      if (!guess.includes(letter)) {
        return { valid: false, reason: `Must contain ${letter.toUpperCase()}` };
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

function buildGrid(session) {
  const { guesses, modeConfig, mode, targetWord } = session;
  const maxAttempts = modeConfig.attempts;

  let grid = '';

  if (mode === 'blind') {
    for (let i = 0; i < guesses.length; i++) {
      const guess = guesses[i];
      let correctCount = 0;
      for (let j = 0; j < guess.word.length; j++) {
        if (targetWord.includes(guess.word[j])) correctCount++;
      }
      grid += `\`${guess.word.toUpperCase()}\` — ${correctCount}/${modeConfig.wordLength} letters\n`;
    }
  } else {
    for (let i = 0; i < guesses.length; i++) {
      const guess = guesses[i];
      let row = '';
      
      for (let j = 0; j < guess.word.length; j++) {
        const letter = guess.word[j].toUpperCase();
        const status = guess.feedback[j];

        if (status === 'correct') {
          row += `🟩`;
        } else if (status === 'present') {
          row += `🟨`;
        } else {
          row += `⬛`;
        }
      }
      row += ` \`${guess.word.toUpperCase()}\``;
      grid += row + '\n';
    }
  }

  // Add empty rows
  const emptyRows = maxAttempts - guesses.length;
  for (let i = 0; i < emptyRows; i++) {
    grid += '⬜⬜⬜⬜⬜\n';
  }

  return grid;
}

function createEmbed(session, statusText = '', gameEnded = false) {
  const { mode, modeConfig, attempts, guesses } = session;
  const modeData = GAME_MODES[mode];

  let color = modeData.color;

  if (!gameEnded && guesses.length > 0) {
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
    .setAuthor({ 
      name: `${modeData.emoji} ${modeData.name}`,
      iconURL: 'https://i.imgur.com/AfFp7pu.png'
    })
    .setTitle('🎮 Wordle Game')
    .setDescription(buildGrid(session))
    .addFields(
      { 
        name: '📊 Progress', 
        value: `${guesses.length}/${modeConfig.attempts} attempts used`, 
        inline: true 
      },
      { 
        name: '🎯 Status', 
        value: statusText || 'Click button to guess!', 
        inline: true 
      }
    )
    .setFooter({ text: `${modeConfig.wordLength} letter word • Wordle` })
    .setTimestamp();

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
    chaosChanges: 0,
    revealedConstraints: { correct: new Set(), present: new Set(), positions: {} }
  };

  const embed = createEmbed(session);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wordle_guess:${userId}`)
      .setLabel('Submit Guess')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✏️')
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
    await handleGuessModal(client, interaction, session);
  });

  collector.on('end', () => {
    if (activeSessions.has(userId)) {
      endGame(client, session, 'timeout');
    }
  });
}

async function handleGuessModal(client, interaction, session) {
  const modal = new ModalBuilder()
    .setCustomId(`wordle_modal:${session.userId}`)
    .setTitle('Enter Your Guess');

  const guessInput = new TextInputBuilder()
    .setCustomId('guess_input')
    .setLabel(`Enter a ${session.modeConfig.wordLength}-letter word`)
    .setStyle(TextInputStyle.Short)
    .setMinLength(session.modeConfig.wordLength)
    .setMaxLength(session.modeConfig.wordLength)
    .setPlaceholder('Type your guess here...')
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(guessInput);
  modal.addComponents(row);

  await interaction.showModal(modal);

  // Wait for modal submission
  const filter = (i) => i.customId === `wordle_modal:${session.userId}` && i.user.id === session.userId;
  
  try {
    const modalSubmit = await interaction.awaitModalSubmit({ filter, time: 60000 });
    const guess = modalSubmit.fields.getTextInputValue('guess_input').toLowerCase().trim();

    await processGuessInput(client, session, guess, modalSubmit);
  } catch (err) {
    // Modal timeout or error
    console.error('[Wordle] Modal error:', err);
  }
}

async function processGuessInput(client, session, guess, interaction) {
  const validation = validateGuess(guess, session);

  if (!validation.valid) {
    await interaction.reply({ 
      content: `❌ ${validation.reason}`, 
      ephemeral: true 
    });
    return;
  }

  if (session.guesses.some(g => g.word === guess)) {
    await interaction.reply({ 
      content: '❌ Already guessed that word!', 
      ephemeral: true 
    });
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
    await interaction.deferUpdate();
    return endGame(client, session, 'win');
  }

  if (session.attempts <= 0) {
    await interaction.deferUpdate();
    return endGame(client, session, 'loss');
  }

  // Chaos mode
  if (session.mode === 'chaos' && session.guesses.length === 3 && session.chaosChanges === 0) {
    session.targetWord = selectWord();
    session.chaosChanges++;
    const embed = createEmbed(session, '🌀 CHAOS! Word changed');
    await interaction.update({ embeds: [embed] });
    return;
  }

  const embed = createEmbed(session);
  await interaction.update({ embeds: [embed] });
}

async function endGame(client, session, endType) {
  const userId = session.userId;

  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
  }

  let statusText = '';
  let color = '#95a5a6';
  let emoji = '⏱️';

  if (endType === 'win') {
    statusText = `✅ Correct! **${session.targetWord.toUpperCase()}**\n🎯 ${session.guesses.length}/${session.modeConfig.attempts} attempts`;
    color = '#2ecc71';
    emoji = '🎉';
  } else if (endType === 'loss') {
    statusText = `❌ Game Over!\nThe word was **${session.targetWord.toUpperCase()}**`;
    color = '#e74c3c';
    emoji = '💀';
  } else if (endType === 'timeout') {
    statusText = `⏱️ Timed out\nWord was **${session.targetWord.toUpperCase()}**`;
    color = '#95a5a6';
    emoji = '⏰';
  } else if (endType === 'forfeit') {
    statusText = `🏳️ Forfeited\nWord was **${session.targetWord.toUpperCase()}**`;
    color = '#95a5a6';
    emoji = '🏳️';
  }

  const embed = createEmbed(session, statusText, true);
  embed.setColor(color);
  embed.setTitle(`${emoji} Game Ended`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wordle_guess:${userId}`)
      .setLabel('Game Over')
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
        .setTitle('🎮 Wordle Game Modes')
        .setDescription('Choose your challenge!')
        .setThumbnail('https://i.imgur.com/AfFp7pu.png');

      for (const [key, mode] of Object.entries(GAME_MODES)) {
        embed.addFields({
          name: `${mode.emoji} ${mode.name}`,
          value: `${mode.description}\n\`${mode.attempts}\` attempts • \`${mode.wordLength}\` letters`,
          inline: true
        });
      }

      embed.setFooter({ text: 'Usage: wordle [mode]' });

      return message.reply({ embeds: [embed] });
    }

    // Stop game
    if (subcommand === 'stop') {
      const session = activeSessions.get(userId);

      if (!session) {
        const embed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setDescription('❌ You don\'t have an active game');
        return message.reply({ embeds: [embed] });
      }

      endGame(client, session, 'forfeit');
      
      const embed = new EmbedBuilder()
        .setColor('#95a5a6')
        .setDescription('🏳️ Game forfeited');
      return message.reply({ embeds: [embed] });
    }

    // Check if already playing
    if (activeSessions.has(userId)) {
      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setDescription('⚠️ You already have an active game!\nUse `wordle stop` to forfeit it');
      return message.reply({ embeds: [embed] });
    }

    // Start game
    const mode = subcommand || 'classic';

    if (!GAME_MODES[mode]) {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setDescription('❌ Invalid mode\nUse `wordle modes` to see available modes');
      return message.reply({ embeds: [embed] });
    }

    await startGame(client, message, userId, mode);
  }
};
