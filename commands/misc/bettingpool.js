const { EmbedBuilder } = require('discord.js');

// ============================================================
// VANESSA BETTING POOL — POINTS-ONLY VERSION
// File: commands/misc/bettingpool.js
//
// Commands:
//   $betpool create <name>
//   $betpool join <name>
//   $betpool play <game number>
//   $poolbet <3-digit number>
//
// No economy changes, cash bets, or cash payouts.
// Active pools and competition points are stored in memory.
// ============================================================

const MAX_PLAYERS = 10;
const GAME_COLOR = 0x2b2d31;

// ============================================================
// POOL SYSTEM
// ============================================================

class BettingPoolSystem {
  constructor() {
    // Pools are separated by server, so identical names can be
    // used in different Discord servers.
    this.activePools = new Map();

    // Competition points are kept in memory until the bot restarts.
    this.points = new Map();

    this.games = {
      1: {
        name: '3-Digit Match',
        description:
          'Choose a 3-digit number. Match digits from the winning number to score points.',
      },
    };
  }

  getPoolKey(guildId, poolName) {
    return `${guildId}:${normalizePoolName(poolName)}`;
  }

  getPool(guildId, poolName) {
    return this.activePools.get(this.getPoolKey(guildId, poolName)) || null;
  }

  getPoints(guildId, userId) {
    return this.points.get(`${guildId}:${userId}`) || 0;
  }

  addPoint(guildId, userId, amount = 1) {
    const key = `${guildId}:${userId}`;
    this.points.set(key, this.getPoints(guildId, userId) + amount);
  }

  createPoolEmbed(pool) {
    const game = this.games[pool.gameId];

    const embed = new EmbedBuilder()
      .setColor(GAME_COLOR)
      .setTitle(`✦ POOL | ${pool.name.toUpperCase()} ✦`)
      .setDescription(
        game
          ? `**Game:** ${game.name}\n${game.description}`
          : 'The host has not selected a game yet.'
      )
      .addFields(
        {
          name: 'HOST',
          value: `${pool.host}`,
          inline: true,
        },
        {
          name: 'PLAYERS',
          value: `${pool.players.size}/${MAX_PLAYERS}`,
          inline: true,
        },
        {
          name: 'STATUS',
          value: pool.status.toUpperCase(),
          inline: true,
        }
      )
      .setTimestamp();

    if (pool.players.size > 0) {
      const playerLines = [];

      for (const [userId, player] of pool.players) {
        const member = pool.guild.members.cache.get(userId);
        const name = member?.displayName || `<@${userId}>`;
        const status = player.betPlaced ? '✅ Number submitted' : '⏳ Waiting';

        playerLines.push(`${name} — ${status}`);
      }

      embed.addFields({
        name: 'PLAYERS',
        value: playerLines.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    if (pool.gameId === 1) {
      embed.addFields({
        name: 'HOW TO PLAY',
        value:
          'Submit a three-digit number from `000` to `999` using `$poolbet 123`.\n' +
          'The bot generates a random three-digit number. Each matching digit scores 1 point; digit order does not matter.\n' +
          'The highest score wins. Each winner earns 1 competition point.',
        inline: false,
      });
    }

    embed.setFooter({
      text: `${pool.guild.name} • Betting Pool`,
    });

    return embed;
  }

  createResultEmbed(pool, results) {
    const embed = new EmbedBuilder()
      .setColor(GAME_COLOR)
      .setTitle(`✦ ${pool.name.toUpperCase()} | RESULTS ✦`)
      .setDescription(
        results.winners.length
          ? `🏆 **${results.winners.length === 1 ? 'Winner' : 'Winners'} announced!**`
          : 'No one matched a digit this round, so no competition points were awarded.'
      )
      .addFields({
        name: '🎯 WINNING NUMBER',
        value: `**${results.winningNumber}**`,
        inline: false,
      })
      .setTimestamp();

    const sortedScores = [...results.scores].sort(
      (a, b) => b.score - a.score
    );

    const scoreLines = sortedScores.map((entry) => {
      const member = pool.guild.members.cache.get(entry.userId);
      const name = member?.displayName || `<@${entry.userId}>`;

      return `**${name}** — ${entry.guess} — **${entry.score} match(es)**`;
    });

    embed.addFields({
      name: '📊 SCORES',
      value: scoreLines.join('\n').slice(0, 1024) || 'No scores available.',
      inline: false,
    });

    if (results.winners.length > 0) {
      const winnerLines = results.winners.map((userId) => {
        const member = pool.guild.members.cache.get(userId);
        const name = member?.displayName || `<@${userId}>`;
        const totalPoints = this.getPoints(pool.guild.id, userId);

        return `🏆 **${name}** — +1 point (Total: ${totalPoints})`;
      });

      embed.addFields({
        name: '🏅 WINNERS',
        value: winnerLines.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    embed.setFooter({
      text: `${pool.guild.name} • Game Finished`,
    });

    return embed;
  }
}

const poolSystem = new BettingPoolSystem();

// ============================================================
// SMALL HELPERS
// ============================================================

function normalizePoolName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function displayPoolName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function createEmbed(title, description, color = GAME_COLOR) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`✦ ${title} ✦`)
    .setDescription(description)
    .setTimestamp();
}

function getPrefix(message, client) {
  if (message.prefix) return message.prefix;

  if (typeof client.getPrefix === 'function' && message.guild) {
    return client.getPrefix(message.guild.id) || '$';
  }

  return '$';
}

function send(message, title, description, color = GAME_COLOR) {
  return message.channel.send({
    embeds: [createEmbed(title, description, color)],
  });
}

function hasSubmittedNumber(pool) {
  return [...pool.players.values()].some((player) => player.betPlaced);
}

function findHostedPool(guildId, userId) {
  for (const [key, pool] of poolSystem.activePools) {
    if (
      pool.guild.id === guildId &&
      pool.host.id === userId
    ) {
      return { key, pool };
    }
  }

  return null;
}

function findJoinedPool(guildId, userId) {
  for (const [key, pool] of poolSystem.activePools) {
    if (
      pool.guild.id === guildId &&
      pool.players.has(userId)
    ) {
      return { key, pool };
    }
  }

  return null;
}

function resolveTarget(message, input) {
  const mentioned = message.mentions?.members?.first();
  if (mentioned) return mentioned;

  const raw = String(input || '').trim();
  if (!raw) return null;

  const mentionMatch = raw.match(/^<@!?(\d+)>$/);
  const numericMatch = raw.match(/^\d{17,20}$/);
  const userId = mentionMatch?.[1] || numericMatch?.[0];

  if (userId) {
    return message.guild.members.cache.get(userId) || null;
  }

  const query = raw.replace(/^@/, '').toLowerCase();

  return (
    message.guild.members.cache.find((member) =>
      member.user.username.toLowerCase() === query ||
      member.displayName.toLowerCase() === query ||
      member.user.tag.toLowerCase() === query
    ) || null
  );
}

// ============================================================
// CREATE POOL
// ============================================================

async function createBetpool(message, args) {
  const rawName = args.join(' ').trim();

  if (!rawName) {
    return send(
      message,
      'Missing Pool Name',
      `Usage: \`${getPrefix(message, message.client)}betpool create <name>\`\n` +
      `Example: \`${getPrefix(message, message.client)}betpool create monkey\``
    );
  }

  if (rawName.length > 40) {
    return send(message, 'Name Too Long', 'Keep pool names to 40 characters or fewer.');
  }

  if (findJoinedPool(message.guild.id, message.author.id)) {
    return send(
      message,
      'Already in a Pool',
      'Finish or leave your current pool before creating another one.'
    );
  }

  const normalizedName = normalizePoolName(rawName);
  const key = poolSystem.getPoolKey(message.guild.id, normalizedName);

  if (poolSystem.activePools.has(key)) {
    return send(
      message,
      'Pool Already Exists',
      `A pool named **${displayPoolName(rawName)}** already exists in this server.`
    );
  }

  const pool = {
    name: displayPoolName(rawName),
    guild: message.guild,
    channel: message.channel,
    host: message.member,
    gameId: null,
    players: new Map(),
    status: 'waiting',
    createdAt: Date.now(),
  };

  // The host automatically joins their own pool.
  pool.players.set(message.author.id, {
    betPlaced: false,
    betData: null,
    joinedAt: Date.now(),
  });

  poolSystem.activePools.set(key, pool);

  const prefix = getPrefix(message, message.client);
  const gameList = Object.entries(poolSystem.games)
    .map(([id, game]) => `**${id}. ${game.name}** — ${game.description}`)
    .join('\n');

  const embed = createEmbed(
    'Pool Created',
    `Pool **${pool.name}** has been created!\n\n` +
    `**1. Select a game:** \`${prefix}betpool play 1\`\n` +
    `**2. Invite players:** \`${prefix}betpool invite @player\`\n` +
    `**3. Other players join:** \`${prefix}betpool join ${pool.name}\`\n` +
    `**4. Everyone submits a number:** \`${prefix}poolbet 123\`\n\n` +
    '**Available games**\n' +
    gameList
  );

  embed.setFooter({
    text: `${message.guild.name} • Pool Created`,
  });

  return message.channel.send({ embeds: [embed] });
}

// ============================================================
// SELECT GAME
// ============================================================

async function setGame(message, args) {
  const hosted = findHostedPool(message.guild.id, message.author.id);

  if (!hosted) {
    return send(
      message,
      'No Pool Found',
      'Create a pool first using `betpool create <name>`.'
    );
  }

  const { pool } = hosted;

  if (pool.status !== 'waiting') {
    return send(
      message,
      'Pool Already Open',
      `This pool is already in the **${pool.status}** phase.`
    );
  }

  const gameId = Number.parseInt(args[0], 10);

  if (!Number.isInteger(gameId) || !poolSystem.games[gameId]) {
    return send(
      message,
      'Invalid Game',
      `Available game IDs: ${Object.keys(poolSystem.games).join(', ')}.`
    );
  }

  pool.gameId = gameId;
  pool.status = 'open';

  const prefix = getPrefix(message, message.client);

  return send(
    message,
    'Game Selected',
    `Pool **${pool.name}** will play **${poolSystem.games[gameId].name}**.\n\n` +
    `Players can now join with \`${prefix}betpool join ${pool.name}\`.\n` +
    `When everyone has joined, each player submits a number with \`${prefix}poolbet 123\`.`
  );
}

// ============================================================
// JOIN POOL
// ============================================================

async function joinBetpool(message, args) {
  const rawName = args.join(' ').trim();

  if (!rawName) {
    return send(
      message,
      'Missing Pool Name',
      `Usage: \`${getPrefix(message, message.client)}betpool join <name>\``
    );
  }

  const pool = poolSystem.getPool(message.guild.id, rawName);

  if (!pool) {
    return send(message, 'Pool Not Found', `No pool named **${rawName}** exists in this server.`);
  }

  if (pool.players.has(message.author.id)) {
    return send(message, 'Already Joined', 'You are already in this pool.');
  }

  if (pool.status !== 'open') {
    return send(
      message,
      'Pool Not Open',
      `This pool is in the **${pool.status}** phase and is not accepting players.`
    );
  }

  if (hasSubmittedNumber(pool)) {
    return send(
      message,
      'Round Already Started',
      'Players cannot join after someone has submitted a number.'
    );
  }

  if (pool.players.size >= MAX_PLAYERS) {
    return send(message, 'Pool Full', `This pool already has the maximum of ${MAX_PLAYERS} players.`);
  }

  const existingPool = findJoinedPool(message.guild.id, message.author.id);

  if (existingPool) {
    return send(
      message,
      'Already in Another Pool',
      `You are already in **${existingPool.pool.name}**. Finish that pool first.`
    );
  }

  pool.players.set(message.author.id, {
    betPlaced: false,
    betData: null,
    joinedAt: Date.now(),
  });

  return send(
    message,
    'Joined Pool',
    `You've joined **${pool.name}**!\n` +
    `Players: **${pool.players.size}/${MAX_PLAYERS}**\n\n` +
    'Wait for everyone to join, then submit your three-digit number using `poolbet 123`.'
  );
}

// ============================================================
// LIST GAMES AND ACTIVE POOLS
// ============================================================

async function listGames(message) {
  const gameLines = Object.entries(poolSystem.games)
    .map(([id, game]) => `**Game ${id}: ${game.name}**\n${game.description}`)
    .join('\n\n');

  const serverPools = [...poolSystem.activePools.values()]
    .filter((pool) => pool.guild.id === message.guild.id);

  const poolLines = serverPools.length
    ? serverPools.map((pool) => {
        return `**${pool.name}** — ${pool.players.size}/${MAX_PLAYERS} players — ${pool.status}`;
      }).join('\n')
    : 'There are no active pools in this server.';

  const embed = createEmbed(
    'Games & Active Pools',
    `**AVAILABLE GAMES**\n${gameLines}\n\n**ACTIVE POOLS**\n${poolLines}`
  );

  embed.setFooter({
    text: `${message.guild.name} • Game List`,
  });

  return message.channel.send({ embeds: [embed] });
}

// ============================================================
// SUBMIT NUMBER — $poolbet 123
// ============================================================

async function placePoolBet(message, args) {
  const joined = findJoinedPool(message.guild.id, message.author.id);

  if (!joined) {
    return send(
      message,
      'No Pool Found',
      'You are not in an active pool. Join one using `betpool join <name>`.'
    );
  }

  const { key, pool } = joined;
  const player = pool.players.get(message.author.id);

  if (!['open', 'betting'].includes(pool.status)) {
    return send(message, 'Pool Not Ready', `This pool is in the **${pool.status}** phase.`);
  }

  if (pool.gameId !== 1) {
    return send(message, 'No Game Selected', 'The host needs to select a game first.');
  }

  if (pool.players.size < 2) {
    return send(message, 'Need More Players', 'At least two players must join before the round can start.');
  }

  if (player.betPlaced) {
    return send(message, 'Number Already Submitted', 'You have already submitted your number this round.');
  }

  const guess = args[0]?.trim();

  if (args.length !== 1 || !/^\d{3}$/.test(guess || '')) {
    return send(
      message,
      'Invalid Number',
      'Submit exactly three digits from `000` to `999`.\nExample: `poolbet 123`'
    );
  }

  player.betPlaced = true;
  player.betData = guess;
  pool.status = 'betting';

  await send(
    message,
    'Number Submitted',
    `Your number for **${pool.name}** has been recorded.\n` +
    `Submitted: **${guess}**\n` +
    'Your number is hidden until the round finishes.'
  );

  const allSubmitted = [...pool.players.values()].every(
    (entry) => entry.betPlaced
  );

  if (allSubmitted) {
    await resolvePool(key);
    return;
  }

  const waitingCount = [...pool.players.values()].filter(
    (entry) => !entry.betPlaced
  ).length;

  await pool.channel.send({
    embeds: [
      createEmbed(
        'Waiting for Players',
        `**${waitingCount}** player(s) still need to submit their numbers for **${pool.name}**.`
      ),
    ],
  });
}

// ============================================================
// CALCULATE MATCHING DIGITS
// ============================================================

function countMatchingDigits(guess, winningNumber) {
  const availableDigits = {};

  for (const digit of winningNumber) {
    availableDigits[digit] = (availableDigits[digit] || 0) + 1;
  }

  let matches = 0;

  for (const digit of guess) {
    if (availableDigits[digit] > 0) {
      matches += 1;
      availableDigits[digit] -= 1;
    }
  }

  return matches;
}

// ============================================================
// RESOLVE ROUND
// ============================================================

async function resolvePool(key) {
  const pool = poolSystem.activePools.get(key);

  if (!pool || pool.status === 'locked') return;

  const allSubmitted = [...pool.players.values()].every(
    (player) => player.betPlaced
  );

  if (!allSubmitted || pool.players.size < 2) return;

  // Lock the round before doing async work to prevent double resolution.
  pool.status = 'locked';

  const winningNumber = Array.from(
    { length: 3 },
    () => Math.floor(Math.random() * 10)
  ).join('');

  const scores = [];

  for (const [userId, player] of pool.players) {
    scores.push({
      userId,
      guess: player.betData,
      score: countMatchingDigits(player.betData, winningNumber),
    });
  }

  const highestScore = Math.max(...scores.map((entry) => entry.score));

  // A zero-match round has no winner and awards no competition points.
  const winners = highestScore > 0
    ? scores
        .filter((entry) => entry.score === highestScore)
        .map((entry) => entry.userId)
    : [];

  // Each winner receives one competition point, including tied winners.
  for (const winnerId of winners) {
    poolSystem.addPoint(pool.guild.id, winnerId, 1);
  }

  const results = {
    winningNumber,
    scores,
    winners,
  };

  try {
    await pool.channel.send({
      embeds: [poolSystem.createResultEmbed(pool, results)],
    });
  } catch (error) {
    console.error('[BettingPool] Could not send results:', error);
  } finally {
    pool.status = 'finished';
    poolSystem.activePools.delete(key);
  }
}

// ============================================================
// KICK PLAYER — HOST ONLY
// ============================================================

async function kickPlayer(message, args) {
  const hosted = findHostedPool(message.guild.id, message.author.id);

  if (!hosted) {
    return send(message, 'No Pool Found', 'You need to host a pool to kick a player.');
  }

  const { pool } = hosted;

  if (pool.status !== 'open' || hasSubmittedNumber(pool)) {
    return send(
      message,
      'Cannot Kick Player',
      'Players can only be removed before anyone submits a number.'
    );
  }

  const target = resolveTarget(message, args.join(' '));

  if (!target) {
    return send(message, 'Player Not Found', 'Mention a valid server member to kick.');
  }

  if (target.id === pool.host.id) {
    return send(message, 'Invalid Target', 'You cannot kick yourself as the host. Delete the pool instead.');
  }

  if (!pool.players.has(target.id)) {
    return send(message, 'Player Not in Pool', `${target.displayName} is not in your pool.`);
  }

  pool.players.delete(target.id);

  return send(
    message,
    'Player Removed',
    `${target.displayName} has been removed from **${pool.name}**.`
  );
}

// ============================================================
// INVITE PLAYER — HOST ONLY
// ============================================================

async function invitePlayer(message, args) {
  const hosted = findHostedPool(message.guild.id, message.author.id);

  if (!hosted) {
    return send(message, 'No Pool Found', 'You need to host a pool to invite players.');
  }

  const { pool } = hosted;

  if (pool.status !== 'open' || hasSubmittedNumber(pool)) {
    return send(
      message,
      'Pool Not Accepting Players',
      'Invite players before anyone submits a number.'
    );
  }

  const target = resolveTarget(message, args.join(' '));

  if (!target) {
    return send(message, 'Player Not Found', 'Mention a valid server member to invite.');
  }

  if (pool.players.has(target.id)) {
    return send(message, 'Already Joined', `${target.displayName} is already in your pool.`);
  }

  if (pool.players.size >= MAX_PLAYERS) {
    return send(message, 'Pool Full', `Your pool already has ${MAX_PLAYERS} players.`);
  }

  const prefix = getPrefix(message, message.client);

  const inviteEmbed = createEmbed(
    'Pool Invitation',
    `${message.member.displayName} invited you to join **${pool.name}** in **${message.guild.name}**.\n\n` +
    `Join using \`${prefix}betpool join ${pool.name}\`.\n` +
    'This is a points-only number-matching game.'
  );

  try {
    await target.send({ embeds: [inviteEmbed] });
    return send(message, 'Invitation Sent', `An invitation was sent to ${target}.`);
  } catch {
    return send(
      message,
      'Could Not DM Player',
      `I couldn't DM ${target}. Ask them to use \`${prefix}betpool join ${pool.name}\` instead.`
    );
  }
}

// ============================================================
// DELETE POOL — HOST ONLY
// ============================================================

async function deleteBetpool(message, args) {
  const rawName = args.join(' ').trim();

  if (!rawName) {
    return send(
      message,
      'Missing Pool Name',
      `Usage: \`${getPrefix(message, message.client)}betpool delete <name>\``
    );
  }

  const key = poolSystem.getPoolKey(message.guild.id, rawName);
  const pool = poolSystem.activePools.get(key);

  if (!pool) {
    return send(message, 'Pool Not Found', `No pool named **${rawName}** exists in this server.`);
  }

  if (pool.host.id !== message.author.id) {
    return send(message, 'Permission Denied', 'Only the host can delete this pool.');
  }

  poolSystem.activePools.delete(key);

  return send(message, 'Pool Deleted', `Pool **${pool.name}** has been deleted.`);
}

// ============================================================
// POOL INFO
// ============================================================

async function poolInfo(message, args) {
  let pool = null;
  const rawName = args.join(' ').trim();

  if (rawName) {
    pool = poolSystem.getPool(message.guild.id, rawName);
  } else {
    const joined = findJoinedPool(message.guild.id, message.author.id);
    pool = joined?.pool || null;
  }

  if (!pool) {
    return send(
      message,
      'Pool Not Found',
      'Specify a valid pool name, or join an active pool first.\nExample: `betpool info monkey`'
    );
  }

  return message.channel.send({
    embeds: [poolSystem.createPoolEmbed(pool)],
  });
}

// ============================================================
// COMPETITION POINTS LEADERBOARD
// ============================================================

async function showLeaderboard(message) {
  const guildPrefix = `${message.guild.id}:`;

  const entries = [...poolSystem.points.entries()]
    .filter(([key]) => key.startsWith(guildPrefix))
    .map(([key, points]) => ({
      userId: key.slice(guildPrefix.length),
      points,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

  if (entries.length === 0) {
    return send(
      message,
      'Points Leaderboard',
      'Nobody has earned any competition points yet. Play a pool to get started!'
    );
  }

  const lines = entries.map((entry, index) => {
    const member = message.guild.members.cache.get(entry.userId);
    const name = member?.displayName || `<@${entry.userId}>`;

    return `**${index + 1}.** ${name} — **${entry.points} point(s)**`;
  });

  const embed = createEmbed(
    'Competition Leaderboard',
    lines.join('\n')
  );

  embed.setFooter({
    text: `${message.guild.name} • Points reset when the bot restarts`,
  });

  return message.channel.send({ embeds: [embed] });
}

// ============================================================
// HELP
// ============================================================

async function betpoolHelp(message) {
  const prefix = getPrefix(message, message.client);

  const embed = createEmbed(
    'BETTING POOL GUIDE',
    'Play a three-digit matching game with your server. This version uses competition points only; it does not deduct or award currency.'
  ).addFields(
    {
      name: '🎮 HOW TO START',
      value:
        `**1. Create a pool**\n\`${prefix}betpool create monkey\`\n\n` +
        `**2. Select the game**\n\`${prefix}betpool play 1\`\n\n` +
        `**3. Invite friends or let them join**\n\`${prefix}betpool invite @player\`\n` +
        `\`${prefix}betpool join monkey\`\n\n` +
        `**4. Everyone submits one number**\n\`${prefix}poolbet 123\``,
      inline: false,
    },
    {
      name: '🎯 GAME RULES',
      value:
        '• Choose exactly three digits, from `000` to `999`.\n' +
        '• The bot generates a random three-digit winning number.\n' +
        '• Every matching digit is worth 1 match, regardless of order.\n' +
        '• Repeated digits only match as many times as they appear in the winning number.\n' +
        '• The highest score wins. Every winner earns 1 competition point.\n' +
        '• If everyone scores zero, nobody earns a point.',
      inline: false,
    },
    {
      name: '⌨️ COMMAND LIST',
      value:
        `\`${prefix}betpool create <name>\` — Create a pool\n` +
        `\`${prefix}betpool join <name>\` — Join a pool\n` +
        `\`${prefix}betpool play <number>\` — Select a game as host\n` +
        `\`${prefix}poolbet <000-999>\` — Submit your number\n` +
        `\`${prefix}betpool list\` — View games and active pools\n` +
        `\`${prefix}betpool info <name>\` — View pool information\n` +
        `\`${prefix}betpool invite @player\` — Invite a player\n` +
        `\`${prefix}betpool kick @player\` — Remove a player\n` +
        `\`${prefix}betpool delete <name>\` — Delete your pool\n` +
        `\`${prefix}betpool leaderboard\` — View competition points\n` +
        `\`${prefix}betpool help\` — Show this guide`,
      inline: false,
    },
    {
      name: '📌 IMPORTANT',
      value:
        `The host automatically joins their own pool.\n` +
        `A pool can have up to ${MAX_PLAYERS} players, including the host.\n` +
        'Players cannot join after the first number is submitted.\n' +
        'Active pools and competition points reset if Vanessa restarts.',
      inline: false,
    }
  );

  embed.setFooter({
    text: `${message.guild.name} • Game Guide`,
  });

  return message.channel.send({ embeds: [embed] });
}

// ============================================================
// MAIN COMMAND MODULE — COMPATIBLE WITH YOUR COMMAND HANDLER
// ============================================================

module.exports = {
  name: 'betpool',
  aliases: ['bettingpool', 'poolbet'],
  description: 'Create and play a three-digit matching pool game.',
  category: 'misc',
  usage: 'betpool <create|join|play|list|info|invite|kick|delete|leaderboard|help>',

  // Exported for the alias to use the same system instance if needed.
  poolSystem,

  async execute(client, message, args) {
    if (!message.guild || !message.member) return;

    // Detect whether the user invoked "poolbet" or "betpool".
    // Your command handler sets message.prefix before execute().
    const prefix = getPrefix(message, client);
    const rawContent = message.content.trim();

    const commandText = rawContent.startsWith(prefix)
      ? rawContent.slice(prefix.length).trim()
      : rawContent;

    const parts = commandText.split(/\s+/).filter(Boolean);
    const invokedName = (parts.shift() || '').toLowerCase();
    const commandArgs = parts;

    if (invokedName === 'poolbet') {
      return placePoolBet(message, commandArgs);
    }

    const action = (commandArgs.shift() || '').toLowerCase();

    switch (action) {
      case 'create':
        return createBetpool(message, commandArgs);

      case 'join':
        return joinBetpool(message, commandArgs);

      case 'play':
        return setGame(message, commandArgs);

      case 'list':
        return listGames(message);

      case 'info':
        return poolInfo(message, commandArgs);

      case 'invite':
        return invitePlayer(message, commandArgs);

      case 'kick':
        return kickPlayer(message, commandArgs);

      case 'delete':
        return deleteBetpool(message, commandArgs);

      case 'leaderboard':
      case 'points':
        return showLeaderboard(message);

      case 'help':
        return betpoolHelp(message);

      default: {
        const p = getPrefix(message, client);

        return send(
          message,
          'Betting Pool',
          `Use \`${p}betpool help\` to see the command list.\n` +
          `Create a pool with \`${p}betpool create <name>\`.`
        );
      }
    }
  },
};