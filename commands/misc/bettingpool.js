const economy = require('../../handlers/economy');
const universalHelper = require('../../handlers/universalHelper');

// ============================================================
// VANESSA BETTING POOL — PERSISTENT POINTS-ONLY VERSION
// Compatible with handlers/commandHandler.js.
// Competition points and active pools are persisted between restarts.
// The game uses competition points for its leaderboard.
// ============================================================

const MAX_PLAYERS = 10;
const db = economy.db;

// Shared points table, kept in the existing economy database.
db.prepare(`
  CREATE TABLE IF NOT EXISTS game_competition_points (
    game TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (game, guild_id, user_id)
  )
`).run();

// JSON payloads preserve pool status, players, and submitted guesses.
db.prepare(`
  CREATE TABLE IF NOT EXISTS betpool_sessions (
    pool_key TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    host_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`).run();

const getPointsStmt = db.prepare(`
  SELECT points FROM game_competition_points
  WHERE game = 'betpool' AND guild_id = ? AND user_id = ?
`);

const addPointStmt = db.prepare(`
  INSERT INTO game_competition_points (game, guild_id, user_id, points, updated_at)
  VALUES ('betpool', ?, ?, ?, ?)
  ON CONFLICT(game, guild_id, user_id) DO UPDATE SET
    points = game_competition_points.points + excluded.points,
    updated_at = excluded.updated_at
`);

const getLeaderboardStmt = db.prepare(`
  SELECT user_id, points
  FROM game_competition_points
  WHERE game = 'betpool' AND guild_id = ? AND points > 0
  ORDER BY points DESC, updated_at ASC, user_id ASC
  LIMIT 10
`);

const saveSessionStmt = db.prepare(`
  INSERT INTO betpool_sessions
    (pool_key, guild_id, channel_id, host_id, payload, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(pool_key) DO UPDATE SET
    guild_id = excluded.guild_id,
    channel_id = excluded.channel_id,
    host_id = excluded.host_id,
    payload = excluded.payload,
    updated_at = excluded.updated_at
`);

const deleteSessionStmt = db.prepare(
  'DELETE FROM betpool_sessions WHERE pool_key = ?'
);

function normalizePoolName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function displayPoolName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function createEmbed(title, description, context) {
  const guild = context?.guild || null;
  const client = context?.client || guild?.client;

  if (!client || !guild) {
    throw new Error('BettingPool embed requires a Discord client and guild context.');
  }

  // Use Vanessa's shared embed helper for the configured theme colour and
  // the current server prefix. Keep the game title styling consistent.
  return universalHelper.createEmbed(client, { guild }, {
    title: `✦ ${title} ✦`,
    description,
  }).setTimestamp();
}

function getPrefix(message, client) {
  if (message.prefix) return message.prefix;

  if (typeof client.getPrefix === 'function' && message.guild) {
    return client.getPrefix(message.guild.id) || '$';
  }

  return '$';
}

function send(message, title, description) {
  return message.channel.send({
    embeds: [createEmbed(title, description, message)],
  });
}

function normalizePlayer(player) {
  return {
    betPlaced: Boolean(player.betPlaced),
    betData: player.betData == null ? null : String(player.betData),
    joinedAt: Number(player.joinedAt) || Date.now(),
  };
}

class BettingPoolSystem {
  constructor() {
    this.activePools = new Map();
    this.client = null;
    this.resolving = new Set();

    this.games = {
      1: {
        name: '3-Digit Match',
        description: 'Choose a 3-digit number. Matching digits score points.',
      },
    };
  }

  getPoolKey(guildId, poolName) {
    return `${guildId}:${normalizePoolName(poolName)}`;
  }

  getPool(guildId, poolName) {
    return this.activePools.get(
      this.getPoolKey(guildId, poolName)
    ) || null;
  }

  getPoints(guildId, userId) {
    return Number(
      getPointsStmt.get(
        String(guildId),
        String(userId)
      )?.points || 0
    );
  }

  addPoint(guildId, userId, amount = 1) {
    const value = Math.floor(Number(amount));

    if (!Number.isFinite(value) || value <= 0) {
      return this.getPoints(guildId, userId);
    }

    addPointStmt.run(
      String(guildId),
      String(userId),
      value,
      Date.now()
    );

    return this.getPoints(guildId, userId);
  }

  serializePool(pool) {
    return {
      name: pool.name,
      gameId: pool.gameId,
      status: pool.status,
      createdAt: pool.createdAt,

      players: [...pool.players.entries()].map(([userId, player]) => ({
        userId: String(userId),
        ...normalizePlayer(player),
      })),
    };
  }

  savePool(key, pool) {
    saveSessionStmt.run(
      String(key),
      String(pool.guild.id),
      String(pool.channel.id),
      String(pool.hostId),
      JSON.stringify(this.serializePool(pool)),
      Date.now()
    );
  }

  deletePool(key) {
    deleteSessionStmt.run(String(key));
    this.activePools.delete(String(key));
  }

  createPoolEmbed(pool) {
    const game = this.games[pool.gameId];
    const prefix = getPrefix(
      { guild: pool.guild },
      this.client
    );

    const embed = createEmbed(
      `POOL | ${pool.name.toUpperCase()}`,
      game
        ? `**Game:** ${game.name}\n${game.description}`
        : 'The host has not selected a game yet.',
      {
        client: this.client,
        guild: pool.guild,
      }
    ).addFields(
      {
        name: 'HOST',
        value: `<@${pool.hostId}>`,
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
    ).setTimestamp();

    if (pool.players.size > 0) {
      const playerLines = [];

      for (const [userId, player] of pool.players) {
        const member = pool.guild.members.cache.get(userId);
        const name = member?.displayName || `<@${userId}>`;

        playerLines.push(
          `${name} — ${player.betPlaced ? '✅ Number submitted' : '⏳ Waiting'}`
        );
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
          `Submit a three-digit number from \`000\` to \`999\` using \`${prefix}poolbet 123\`.\n` +
          'Each matching digit scores 1 point regardless of order. The highest score wins, and each winner earns 1 competition point.',
        inline: false,
      });
    }

    embed.setFooter({
      text: `${pool.guild.name} • Betting Pool`,
    });

    return embed;
  }

  createResultEmbed(pool, results) {
    const embed = createEmbed(
      `${pool.name.toUpperCase()} | RESULTS`,
      results.winners.length
        ? `🏆 **${results.winners.length === 1 ? 'Winner' : 'Winners'} announced!**`
        : 'No one matched a digit this round, so no points were awarded.',
      {
        client: this.client,
        guild: pool.guild,
      }
    ).addFields({
      name: '🎯 WINNING NUMBER',
      value: `**${results.winningNumber}**`,
      inline: false,
    });

    const sortedScores = [...results.scores].sort(
      (a, b) => b.score - a.score ||
        a.userId.localeCompare(b.userId)
    );

    const scoreLines = sortedScores.map(entry => {
      const member = pool.guild.members.cache.get(entry.userId);

      return (
        `**${member?.displayName || `<@${entry.userId}>`}** — ` +
        `${entry.guess} — **${entry.score} match(es)**`
      );
    });

    embed.addFields({
      name: '📊 SCORES',
      value: scoreLines.join('\n').slice(0, 1024) || 'No scores available.',
      inline: false,
    });

    if (results.winners.length > 0) {
      const winnerLines = results.winners.map(userId => {
        const member = pool.guild.members.cache.get(userId);

        return (
          `🏆 **${member?.displayName || `<@${userId}>`}** — ` +
          `+1 point (Total: ${this.getPoints(pool.guild.id, userId)})`
        );
      });

      embed.addFields({
        name: '🏅 WINNERS',
        value: winnerLines.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    embed.setFooter({
      text: `${pool.guild.name} • Betting Pool Results`,
    });

    return embed;
  }

  async init(client) {
    this.client = client;

    const rows = db.prepare(
      'SELECT * FROM betpool_sessions'
    ).all();

    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload);

        const guild =
          client.guilds.cache.get(row.guild_id) ||
          await client.guilds.fetch(row.guild_id).catch(() => null);

        if (!guild) {
          console.warn(
            `[BettingPool] Could not restore pool ${row.pool_key}: guild unavailable.`
          );
          continue;
        }

        const channel =
          guild.channels.cache.get(row.channel_id) ||
          await guild.channels.fetch(row.channel_id).catch(() => null);

        if (!channel || !channel.isTextBased()) {
          console.warn(
            `[BettingPool] Could not restore pool ${row.pool_key}: channel unavailable.`
          );
          continue;
        }

        const pool = {
          name: displayPoolName(payload.name),
          guild,
          channel,
          hostId: String(row.host_id),
          gameId: payload.gameId == null
            ? null
            : Number(payload.gameId),

          players: new Map(
            (payload.players || []).map(player => [
              String(player.userId),
              normalizePlayer(player),
            ])
          ),

          status: String(payload.status || 'waiting'),
          createdAt: Number(payload.createdAt) || Date.now(),
        };

        this.activePools.set(String(row.pool_key), pool);
      } catch (error) {
        console.error(
          `[BettingPool] Could not restore ${row.pool_key}:`,
          error
        );
      }
    }

    console.log(
      `[BettingPool] Restored ${this.activePools.size} active pool(s).`
    );

    // Finish a round if all players had submitted before a restart.
    for (const [key, pool] of [...this.activePools.entries()]) {
      const everyoneSubmitted =
        pool.players.size >= 2 &&
        [...pool.players.values()].every(player => player.betPlaced);

      if (pool.status === 'locked' || everyoneSubmitted) {
        await resolvePool(key);
      }
    }
  }
}

const poolSystem = new BettingPoolSystem();

function hasSubmittedNumber(pool) {
  return [...pool.players.values()].some(
    player => player.betPlaced
  );
}

function findHostedPool(guildId, userId) {
  for (const [key, pool] of poolSystem.activePools) {
    if (
      pool.guild.id === guildId &&
      pool.hostId === userId
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

  const match =
    raw.match(/^<@!?(\d+)>$/) ||
    raw.match(/^(\d{17,20})$/);

  const userId = match?.[1] || match?.[0];

  if (userId) {
    return message.guild.members.cache.get(userId) || null;
  }

  const query = raw.replace(/^@/, '').toLowerCase();

  return message.guild.members.cache.find(member =>
    member.user.username.toLowerCase() === query ||
    member.displayName.toLowerCase() === query ||
    member.user.tag?.toLowerCase() === query
  ) || null;
}

async function createBetpool(message, args) {
  const rawName = args.join(' ').trim();
  const prefix = getPrefix(message, message.client);

  if (!rawName) {
    return send(
      message,
      'Missing Pool Name',
      `Usage: \`${prefix}betpool create <name>\``
    );
  }

  if (rawName.length > 40) {
    return send(
      message,
      'Name Too Long',
      'Keep pool names to 40 characters or fewer.'
    );
  }

  if (findJoinedPool(message.guild.id, message.author.id)) {
    return send(
      message,
      'Already in a Pool',
      'Finish your current pool before creating another one.'
    );
  }

  const key = poolSystem.getPoolKey(
    message.guild.id,
    rawName
  );

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
    hostId: message.author.id,
    gameId: null,
    players: new Map(),
    status: 'waiting',
    createdAt: Date.now(),
  };

  pool.players.set(message.author.id, {
    betPlaced: false,
    betData: null,
    joinedAt: Date.now(),
  });

  poolSystem.activePools.set(key, pool);
  poolSystem.savePool(key, pool);

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
    `**Available games**\n${gameList}`,
    message
  ).setFooter({
    text: `${message.guild.name} • Pool Created`,
  });

  return message.channel.send({
    embeds: [embed],
  });
}

async function setGame(message, args) {
  const hosted = findHostedPool(
    message.guild.id,
    message.author.id
  );

  if (!hosted) {
    return send(
      message,
      'No Pool Found',
      `Create a pool first using \`${getPrefix(message, message.client)}betpool create <name>\`.`
    );
  }

  const { key, pool } = hosted;

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

  poolSystem.savePool(key, pool);

  const prefix = getPrefix(message, message.client);

  return send(
    message,
    'Game Selected',
    `Pool **${pool.name}** will play **${poolSystem.games[gameId].name}**.\n\n` +
    `Players can join with \`${prefix}betpool join ${pool.name}\`. ` +
    `When everyone has joined, submit a number with \`${prefix}poolbet 123\`.`
  );
}

async function joinBetpool(message, args) {
  const rawName = args.join(' ').trim();

  if (!rawName) {
    return send(
      message,
      'Missing Pool Name',
      `Usage: \`${getPrefix(message, message.client)}betpool join <name>\``
    );
  }

  const key = poolSystem.getPoolKey(
    message.guild.id,
    rawName
  );

  const pool = poolSystem.activePools.get(key);

  if (!pool) {
    return send(
      message,
      'Pool Not Found',
      `No pool named **${rawName}** exists in this server.`
    );
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
    return send(
      message,
      'Pool Full',
      `This pool already has the maximum of ${MAX_PLAYERS} players.`
    );
  }

  const existingPool = findJoinedPool(
    message.guild.id,
    message.author.id
  );

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

  poolSystem.savePool(key, pool);

  return send(
    message,
    'Joined Pool',
    `You've joined **${pool.name}**!\n` +
    `Players: **${pool.players.size}/${MAX_PLAYERS}**\n\n` +
    `Wait for everyone to join, then submit your three-digit number using ` +
    `\`${getPrefix(message, message.client)}poolbet 123\`.`
  );
}

async function listGames(message) {
  const gameLines = Object.entries(poolSystem.games)
    .map(([id, game]) => `**Game ${id}: ${game.name}**\n${game.description}`)
    .join('\n\n');

  const serverPools = [...poolSystem.activePools.values()]
    .filter(pool => pool.guild.id === message.guild.id);

  const poolLines = serverPools.length
    ? serverPools
      .map(pool => `**${pool.name}** — ${pool.players.size}/${MAX_PLAYERS} players — ${pool.status}`)
      .join('\n')
    : 'There are no active pools in this server.';

  const embed = createEmbed(
    'Games & Active Pools',
    `**AVAILABLE GAMES**\n${gameLines}\n\n**ACTIVE POOLS**\n${poolLines}`,
    message
  ).setFooter({
    text: `${message.guild.name} • Game List`,
  });

  return message.channel.send({
    embeds: [embed],
  });
}

function countMatchingDigits(guess, winningNumber) {
  const available = {};

  for (const digit of winningNumber) {
    available[digit] = (available[digit] || 0) + 1;
  }

  let matches = 0;

  for (const digit of guess) {
    if (available[digit] > 0) {
      matches++;
      available[digit]--;
    }
  }

  return matches;
}

async function placePoolBet(message, args) {
  const joined = findJoinedPool(
    message.guild.id,
    message.author.id
  );

  if (!joined) {
    return send(
      message,
      'No Pool Found',
      `You are not in an active pool. Join one using \`${getPrefix(message, message.client)}betpool join <name>\`.`
    );
  }

  const { key, pool } = joined;
  const player = pool.players.get(message.author.id);

  if (!['open', 'betting'].includes(pool.status)) {
    return send(
      message,
      'Pool Not Ready',
      `This pool is in the **${pool.status}** phase.`
    );
  }

  if (pool.gameId !== 1) {
    return send(
      message,
      'No Game Selected',
      'The host needs to select a game first.'
    );
  }

  if (pool.players.size < 2) {
    return send(
      message,
      'Need More Players',
      'At least two players must join before the round can start.'
    );
  }

  if (player.betPlaced) {
    return send(
      message,
      'Number Already Submitted',
      'You have already submitted your number this round.'
    );
  }

  const guess = args[0]?.trim();

  if (args.length !== 1 || !/^\d{3}$/.test(guess || '')) {
    return send(
      message,
      'Invalid Number',
      `Submit exactly three digits from \`000\` to \`999\`. Example: \`${getPrefix(message, message.client)}poolbet 123\``
    );
  }

  player.betPlaced = true;
  player.betData = guess;
  pool.status = 'betting';

  poolSystem.savePool(key, pool);

  await send(
    message,
    'Number Submitted',
    `Your number for **${pool.name}** has been recorded.\n` +
    `Submitted: **${guess}**\n` +
    'Your number stays hidden until the round finishes.'
  );

  const allSubmitted = [...pool.players.values()]
    .every(entry => entry.betPlaced);

  if (allSubmitted) {
    return resolvePool(key);
  }

  const waitingCount = [...pool.players.values()]
    .filter(entry => !entry.betPlaced).length;

  return pool.channel.send({
    embeds: [
      createEmbed(
        'Waiting for Players',
        `**${waitingCount}** player(s) still need to submit their numbers for **${pool.name}**.`,
        message
      ),
    ],
  });
}

async function resolvePool(key) {
  const pool = poolSystem.activePools.get(String(key));

  if (!pool || poolSystem.resolving.has(String(key))) return;

  const allSubmitted = [...pool.players.values()]
    .every(player => player.betPlaced);

  if (!allSubmitted || pool.players.size < 2) return;

  poolSystem.resolving.add(String(key));

  try {
    pool.status = 'locked';
    poolSystem.savePool(key, pool);

    const winningNumber = Array.from(
      { length: 3 },
      () => Math.floor(Math.random() * 10)
    ).join('');

    const scores = [...pool.players.entries()].map(([userId, player]) => ({
      userId,
      guess: player.betData,
      score: countMatchingDigits(player.betData, winningNumber),
    }));

    const highestScore = Math.max(
      ...scores.map(entry => entry.score)
    );

    const winners = highestScore > 0
      ? scores
        .filter(entry => entry.score === highestScore)
        .map(entry => entry.userId)
      : [];

    // Award points and delete the persisted pool in one transaction so a restart
    // cannot award the same completed round twice.
    db.transaction(() => {
      for (const userId of winners) {
        addPointStmt.run(
          String(pool.guild.id),
          String(userId),
          1,
          Date.now()
        );
      }

      deleteSessionStmt.run(String(key));
    })();

    pool.status = 'finished';
    poolSystem.activePools.delete(String(key));

    try {
      await pool.channel.send({
        embeds: [
          poolSystem.createResultEmbed(pool, {
            winningNumber,
            scores,
            winners,
          }),
        ],
      });
    } catch (error) {
      console.error(
        '[BettingPool] Could not send results:',
        error
      );
    }
  } catch (error) {
    console.error(
      '[BettingPool] Round resolution failed:',
      error
    );

    // Keep the persisted pool available for recovery if the transaction failed.
  } finally {
    poolSystem.resolving.delete(String(key));
  }
}

async function kickPlayer(message, args) {
  const hosted = findHostedPool(
    message.guild.id,
    message.author.id
  );

  if (!hosted) {
    return send(
      message,
      'No Pool Found',
      'You need to host a pool to kick a player.'
    );
  }

  const { key, pool } = hosted;

  if (pool.status !== 'open' || hasSubmittedNumber(pool)) {
    return send(
      message,
      'Cannot Kick Player',
      'Players can only be removed before anyone submits a number.'
    );
  }

  const target = resolveTarget(message, args.join(' '));

  if (!target) {
    return send(
      message,
      'Player Not Found',
      'Mention a valid server member to kick.'
    );
  }

  if (target.id === pool.hostId) {
    return send(
      message,
      'Invalid Target',
      'You cannot kick yourself as host. Delete the pool instead.'
    );
  }

  if (!pool.players.has(target.id)) {
    return send(
      message,
      'Player Not in Pool',
      `${target.displayName} is not in your pool.`
    );
  }

  pool.players.delete(target.id);
  poolSystem.savePool(key, pool);

  return send(
    message,
    'Player Removed',
    `${target.displayName} has been removed from **${pool.name}**.`
  );
}

async function invitePlayer(message, args) {
  const hosted = findHostedPool(
    message.guild.id,
    message.author.id
  );

  if (!hosted) {
    return send(
      message,
      'No Pool Found',
      'You need to host a pool to invite players.'
    );
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
    return send(
      message,
      'Player Not Found',
      'Mention a valid server member to invite.'
    );
  }

  if (pool.players.has(target.id)) {
    return send(
      message,
      'Already Joined',
      `${target.displayName} is already in your pool.`
    );
  }

  if (pool.players.size >= MAX_PLAYERS) {
    return send(
      message,
      'Pool Full',
      `Your pool already has ${MAX_PLAYERS} players.`
    );
  }

  const prefix = getPrefix(message, message.client);

  const inviteEmbed = createEmbed(
    'Pool Invitation',
    `${message.member.displayName} invited you to join **${pool.name}** in **${message.guild.name}**.\n\n` +
    `Join using \`${prefix}betpool join ${pool.name}\`.`,
    message
  );

  try {
    await target.send({
      embeds: [inviteEmbed],
    });

    return send(
      message,
      'Invitation Sent',
      `An invitation was sent to ${target}.`
    );
  } catch {
    return send(
      message,
      'Could Not DM Player',
      `I couldn't DM ${target}. Ask them to use \`${prefix}betpool join ${pool.name}\` instead.`
    );
  }
}

async function deleteBetpool(message, args) {
  const rawName = args.join(' ').trim();

  if (!rawName) {
    return send(
      message,
      'Missing Pool Name',
      `Usage: \`${getPrefix(message, message.client)}betpool delete <name>\``
    );
  }

  const key = poolSystem.getPoolKey(
    message.guild.id,
    rawName
  );

  const pool = poolSystem.activePools.get(key);

  if (!pool) {
    return send(
      message,
      'Pool Not Found',
      `No pool named **${rawName}** exists in this server.`
    );
  }

  if (pool.hostId !== message.author.id) {
    return send(
      message,
      'Permission Denied',
      'Only the host can delete this pool.'
    );
  }

  poolSystem.deletePool(key);

  return send(
    message,
    'Pool Deleted',
    `Pool **${pool.name}** has been deleted.`
  );
}

async function poolInfo(message, args) {
  let pool = null;

  const rawName = args.join(' ').trim();

  if (rawName) {
    pool = poolSystem.getPool(
      message.guild.id,
      rawName
    );
  } else {
    pool =
      findJoinedPool(message.guild.id, message.author.id)?.pool ||
      null;
  }

  if (!pool) {
    return send(
      message,
      'Pool Not Found',
      `Specify a valid pool name, or join an active pool first. Example: \`${getPrefix(message, message.client)}betpool info monkey\``
    );
  }

  return message.channel.send({
    embeds: [poolSystem.createPoolEmbed(pool)],
  });
}

async function showLeaderboard(message) {
  const entries = getLeaderboardStmt.all(
    String(message.guild.id)
  );

  if (!entries.length) {
    return send(
      message,
      'Points Leaderboard',
      'Nobody has earned any competition points yet. Play a pool to get started!'
    );
  }

  const lines = entries.map((entry, index) => {
    const member = message.guild.members.cache.get(entry.user_id);

    return (
      `**${index + 1}.** ` +
      `${member?.displayName || `<@${entry.user_id}>`} — ` +
      `**${entry.points} point(s)**`
    );
  });

  return message.channel.send({
    embeds: [
      createEmbed(
        'Competition Leaderboard',
        lines.join('\n'),
        message
      ).setFooter({
        text: `${message.guild.name} • Betting Pool Leaderboard`,
      }),
    ],
  });
}

async function betpoolHelp(message) {
  const prefix = getPrefix(message, message.client);

  const embed = createEmbed(
    'BETTING POOL GUIDE',
    'Play a three-digit matching game with your server.',
    message
  ).addFields(
    {
      name: '🎮 HOW TO START',
      value:
        `**1. Create a pool**\n\`${prefix}betpool create monkey\`\n\n` +
        `**2. Select the game**\n\`${prefix}betpool play 1\`\n\n` +
        `**3. Invite or join**\n\`${prefix}betpool invite @player\`\n` +
        `\`${prefix}betpool join monkey\`\n\n` +
        `**4. Submit a number**\n\`${prefix}poolbet 123\``,
      inline: false,
    },
    {
      name: '🎯 GAME RULES',
      value:
        '• Choose exactly three digits, from `000` to `999`.\n' +
        '• The bot generates a random three-digit number.\n' +
        '• Matching digits count regardless of order, but repeated digits only match as many times as they appear.\n' +
        '• Highest score wins; each winner earns 1 point.\n' +
        '• If everyone scores zero, nobody earns a point.',
      inline: false,
    },
    {
      name: '⌨️ COMMANDS',
      value:
        `\`${prefix}betpool create <name>\` — Create\n` +
        `\`${prefix}betpool join <name>\` — Join\n` +
        `\`${prefix}betpool play <number>\` — Select game\n` +
        `\`${prefix}poolbet <000-999>\` — Submit number\n` +
        `\`${prefix}betpool list\` — View games and pools\n` +
        `\`${prefix}betpool info <name>\` — View pool\n` +
        `\`${prefix}betpool invite @player\` — Invite\n` +
        `\`${prefix}betpool kick @player\` — Remove player\n` +
        `\`${prefix}betpool delete <name>\` — Delete\n` +
        `\`${prefix}betpool leaderboard\` — View points\n` +
        `\`${prefix}betpool help\` — This guide`,
      inline: false,
    },
    {
      name: '📌 IMPORTANT',
      value: `The host automatically joins. Each pool can hold up to ${MAX_PLAYERS} players.`,
      inline: false,
    }
  ).setFooter({
    text: `${message.guild.name} • Game Guide`,
  });

  return message.channel.send({
    embeds: [embed],
  });
}

async function initializeBetpool(client) {
  return poolSystem.init(client);
}

module.exports = {
  name: 'betpool',
  aliases: ['bettingpool', 'poolbet'],
  description: 'Create and play a persistent three-digit matching pool game.',
  category: 'misc',
  usage: 'betpool <create|join|play|list|info|invite|kick|delete|leaderboard|help>',
  poolSystem,
  init: initializeBetpool,

  async execute(client, message, args) {
    if (!message.guild || !message.member) return;

    // The command loader resolves aliases to this module, so inspect the
    // original invocation to distinguish $poolbet from $betpool.
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