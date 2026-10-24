const { EmbedBuilder } = require('discord.js');
const economy = require('../../handlers/economy');

const db = economy.db;
const MAX_PLAYERS = 10;
const COLOR = 0x2b2d31;

const pools = new Map();
const resolving = new Set();

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

const saveSession = db.prepare(`
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

const deleteSession = db.prepare(`
  DELETE FROM betpool_sessions WHERE pool_key = ?
`);

const addPoint = db.prepare(`
  INSERT INTO game_competition_points
    (game, guild_id, user_id, points, updated_at)
  VALUES ('betpool', ?, ?, 1, ?)
  ON CONFLICT(game, guild_id, user_id) DO UPDATE SET
    points = game_competition_points.points + 1,
    updated_at = excluded.updated_at
`);

const getPoints = db.prepare(`
  SELECT points
  FROM game_competition_points
  WHERE game = 'betpool' AND guild_id = ? AND user_id = ?
`);

const getLeaderboard = db.prepare(`
  SELECT user_id, points
  FROM game_competition_points
  WHERE game = 'betpool' AND guild_id = ? AND points > 0
  ORDER BY points DESC, updated_at ASC
  LIMIT 10
`);

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function displayName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function getKey(guildId, name) {
  return `${guildId}:${normalizeName(name)}`;
}

function getPrefix(message, client) {
  return message.prefix ||
    (message.guild && client.getPrefix?.(message.guild.id)) ||
    '$';
}

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`✦ ${title} ✦`)
    .setDescription(description)
    .setTimestamp();
}

async function send(message, title, description) {
  return message.channel.send({
    embeds: [makeEmbed(title, description)],
  });
}

function getPlayerName(guild, userId) {
  return guild.members.cache.get(userId)?.displayName ||
    `<@${userId}>`;
}

function pointsFor(guildId, userId) {
  return Number(
    getPoints.get(String(guildId), String(userId))?.points || 0
  );
}

function savePool(key, pool) {
  const payload = {
    name: pool.name,
    prefix: pool.prefix,
    gameId: pool.gameId,
    status: pool.status,
    createdAt: pool.createdAt,
    players: [...pool.players.entries()].map(([userId, player]) => ({
      userId,
      submitted: player.submitted,
      guess: player.guess,
      joinedAt: player.joinedAt,
    })),
  };

  saveSession.run(
    key,
    String(pool.guildId),
    String(pool.channelId),
    String(pool.hostId),
    JSON.stringify(payload),
    Date.now()
  );
}

function findHostedPool(guildId, userId) {
  for (const [key, pool] of pools) {
    if (
      pool.guildId === String(guildId) &&
      pool.hostId === String(userId)
    ) {
      return { key, pool };
    }
  }

  return null;
}

function findJoinedPool(guildId, userId) {
  for (const [key, pool] of pools) {
    if (
      pool.guildId === String(guildId) &&
      pool.players.has(String(userId))
    ) {
      return { key, pool };
    }
  }

  return null;
}

function hasSubmitted(pool) {
  return [...pool.players.values()].some(player => player.submitted);
}

function countMatchingDigits(guess, winningNumber) {
  const counts = {};

  for (const digit of winningNumber) {
    counts[digit] = (counts[digit] || 0) + 1;
  }

  let score = 0;

  for (const digit of guess) {
    if (counts[digit] > 0) {
      score++;
      counts[digit]--;
    }
  }

  return score;
}

function createPoolEmbed(pool) {
  const playerLines = [...pool.players.entries()].map(([userId, player]) => {
    return `${getPlayerName(pool.guild, userId)} — ${
      player.submitted ? '✅ Number submitted' : '⏳ Waiting'
    }`;
  });

  return makeEmbed(
    `POOL | ${pool.name.toUpperCase()}`,
    `**Game:** 3-Digit Match\n` +
    `**Host:** <@${pool.hostId}>\n` +
    `**Players:** ${pool.players.size}/${MAX_PLAYERS}\n` +
    `**Status:** ${pool.status}\n\n` +
    `**Players**\n${playerLines.join('\n') || 'No players yet.'}\n\n` +
    `Submit a number with \`${pool.prefix}poolbet 123\`.\n` +
    'Every matching digit earns a match. Winners earn competition points.'
  ).setFooter({
    text: `${pool.guild.name} • Competition points only`,
  });
}

async function resolvePool(key) {
  key = String(key);

  const pool = pools.get(key);

  if (
    !pool ||
    resolving.has(key) ||
    pool.players.size < 2 ||
    ![...pool.players.values()].every(player => player.submitted)
  ) {
    return;
  }

  resolving.add(key);

  try {
    pool.status = 'locked';
    savePool(key, pool);

    const winningNumber = Array.from(
      { length: 3 },
      () => Math.floor(Math.random() * 10)
    ).join('');

    const scores = [...pool.players.entries()].map(([userId, player]) => ({
      userId,
      guess: player.guess,
      score: countMatchingDigits(player.guess, winningNumber),
    }));

    const highestScore = Math.max(...scores.map(item => item.score));

    const winners = highestScore > 0
      ? scores
          .filter(item => item.score === highestScore)
          .map(item => item.userId)
      : [];

    // Awards and session deletion happen atomically so a restart
    // cannot award the same round twice.
    db.transaction(() => {
      for (const userId of winners) {
        addPoint.run(
          String(pool.guildId),
          String(userId),
          Date.now()
        );
      }

      deleteSession.run(key);
    })();

    pools.delete(key);

    const scoreLines = scores
      .sort((a, b) => b.score - a.score)
      .map(item =>
        `${getPlayerName(pool.guild, item.userId)} — ` +
        `**${item.guess}** — ${item.score} match(es)`
      );

    const winnerLines = winners.map(userId =>
      `${getPlayerName(pool.guild, userId)} — ` +
      `total **${pointsFor(pool.guildId, userId)} point(s)**`
    );

    await pool.channel.send({
      embeds: [
        makeEmbed(
          `${pool.name.toUpperCase()} | RESULTS`,
          `**Winning number:** ${winningNumber}\n\n` +
          `**Scores**\n${scoreLines.join('\n').slice(0, 1500) || 'No scores.'}\n\n` +
          `**Winner(s)**\n${winnerLines.join('\n') || 'Nobody matched a digit. No points awarded.'}`
        ).setFooter({
          text: `${pool.guild.name} • Crowns are untouched`,
        }),
      ],
    }).catch(error => {
      console.error('[Betpool] Failed to send result:', error);
    });

  } catch (error) {
    console.error('[Betpool] Failed to resolve pool:', error);

  } finally {
    resolving.delete(key);
  }
}

async function init(client) {
  const rows = db.prepare(`
    SELECT * FROM betpool_sessions
  `).all();

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload);

      const guild =
        client.guilds.cache.get(row.guild_id) ||
        await client.guilds.fetch(row.guild_id).catch(() => null);

      const channel = guild && (
        guild.channels.cache.get(row.channel_id) ||
        await guild.channels.fetch(row.channel_id).catch(() => null)
      );

      if (!guild || !channel?.isTextBased?.()) {
        console.warn(`[Betpool] Could not restore pool ${row.pool_key}.`);
        continue;
      }

      const pool = {
        key: row.pool_key,
        guildId: String(row.guild_id),
        channelId: String(row.channel_id),
        hostId: String(row.host_id),
        guild,
        channel,
        name: displayName(payload.name),
        prefix: payload.prefix || client.getPrefix?.(row.guild_id) || '$',
        gameId: payload.gameId ?? null,
        status: payload.status || 'waiting',
        createdAt: Number(payload.createdAt) || Date.now(),
        players: new Map(
          (payload.players || []).map(player => [
            String(player.userId),
            {
              submitted: Boolean(player.submitted),
              guess: player.guess == null ? null : String(player.guess),
              joinedAt: Number(player.joinedAt) || Date.now(),
            },
          ])
        ),
      };

      pools.set(row.pool_key, pool);

    } catch (error) {
      console.error('[Betpool] Restore error:', error);
    }
  }

  console.log(`[Betpool] Restored ${pools.size} pool(s).`);

  for (const [key, pool] of [...pools]) {
    const allSubmitted =
      pool.players.size >= 2 &&
      [...pool.players.values()].every(player => player.submitted);

    if (allSubmitted) {
      await resolvePool(key);
    }
  }
}

function resolveTarget(message, raw) {
  const mentioned = message.mentions?.members?.first();

  if (mentioned) {
    return mentioned;
  }

  const value = String(raw || '').trim();
  const match =
    value.match(/^<@!?(\d+)>$/) ||
    value.match(/^(\d{17,20})$/);

  if (match) {
    return message.guild.members.cache.get(match[1]) || null;
  }

  const query = value.replace(/^@/, '').toLowerCase();

  return message.guild.members.cache.find(member =>
    member.user.username.toLowerCase() === query ||
    member.displayName.toLowerCase() === query
  ) || null;
}

async function submitNumber(message, args) {
  const joined = findJoinedPool(
    message.guild.id,
    message.author.id
  );

  if (!joined) {
    return send(message, 'No Pool Found', 'Join a pool first with `betpool join <name>`.');
  }

  const { key, pool } = joined;
  const player = pool.players.get(message.author.id);

  if (
    pool.gameId !== 1 ||
    !['open', 'submitting'].includes(pool.status)
  ) {
    return send(message, 'Pool Not Ready', 'The host must select the game and open the pool first.');
  }

  if (pool.players.size < 2) {
    return send(message, 'Need More Players', 'At least two players are needed.');
  }

  if (player.submitted) {
    return send(message, 'Already Submitted', 'You already submitted your number.');
  }

  const guess = args[0];

  if (args.length !== 1 || !/^\d{3}$/.test(guess || '')) {
    return send(message, 'Invalid Number', 'Enter exactly three digits, like `poolbet 007`.');
  }

  player.submitted = true;
  player.guess = guess;
  pool.status = 'submitting';

  savePool(key, pool);

  await send(
    message,
    'Number Submitted',
    `Your number for **${pool.name}** has been saved.`
  );

  if ([...pool.players.values()].every(item => item.submitted)) {
    return resolvePool(key);
  }

  const waiting = [...pool.players.values()].filter(item => !item.submitted).length;

  return pool.channel.send({
    embeds: [
      makeEmbed(
        'Waiting for Players',
        `${waiting} player(s) still need to submit their numbers.`
      ),
    ],
  });
}

async function createPool(message, args, prefix) {
  const rawName = displayName(args.join(' '));

  if (!rawName) {
    return send(message, 'Missing Name', `Usage: \`${prefix}betpool create <name>\``);
  }

  if (rawName.length > 40) {
    return send(message, 'Name Too Long', 'Use 40 characters or fewer.');
  }

  if (findJoinedPool(message.guild.id, message.author.id)) {
    return send(message, 'Already in a Pool', 'Finish your current pool first.');
  }

  const key = getKey(message.guild.id, rawName);

  if (pools.has(key)) {
    return send(message, 'Pool Exists', 'A pool with that name already exists in this server.');
  }

  const pool = {
    key,
    guildId: String(message.guild.id),
    channelId: String(message.channel.id),
    hostId: String(message.author.id),
    guild: message.guild,
    channel: message.channel,
    name: rawName,
    prefix,
    gameId: null,
    status: 'waiting',
    createdAt: Date.now(),
    players: new Map([
      [message.author.id, {
        submitted: false,
        guess: null,
        joinedAt: Date.now(),
      }],
    ]),
  };

  pools.set(key, pool);
  savePool(key, pool);

  return message.channel.send({
    embeds: [
      makeEmbed(
        'Pool Created',
        `**${pool.name}** has been created.\n\n` +
        `1. Select the game: \`${prefix}betpool play 1\`\n` +
        `2. Invite players: \`${prefix}betpool invite @player\`\n` +
        `3. Players join: \`${prefix}betpool join ${pool.name}\`\n` +
        `4. Submit a number: \`${prefix}poolbet 123\`\n\n` +
        'Competition points only. Crowns are not used.'
      ),
    ],
  });
}

async function joinPool(message, args) {
  const name = args.join(' ');

  if (!name) {
    return send(message, 'Missing Name', 'Usage: `betpool join <name>`');
  }

  const key = getKey(message.guild.id, name);
  const pool = pools.get(key);

  if (!pool) return send(message, 'Not Found', 'No pool with that name exists.');
  if (pool.players.has(message.author.id)) return send(message, 'Already Joined', 'You are already in this pool.');

  if (pool.status !== 'open' || hasSubmitted(pool)) {
    return send(message, 'Pool Closed', 'This pool is no longer accepting players.');
  }

  if (pool.players.size >= MAX_PLAYERS) {
    return send(message, 'Pool Full', `Maximum ${MAX_PLAYERS} players.`);
  }

  if (findJoinedPool(message.guild.id, message.author.id)) {
    return send(message, 'Already in a Pool', 'Finish your current pool first.');
  }

  pool.players.set(message.author.id, {
    submitted: false,
    guess: null,
    joinedAt: Date.now(),
  });

  savePool(key, pool);

  return send(
    message,
    'Joined Pool',
    `You joined **${pool.name}**. Players: ${pool.players.size}/${MAX_PLAYERS}.`
  );
}

async function selectGame(message, args) {
  const hosted = findHostedPool(message.guild.id, message.author.id);

  if (!hosted) return send(message, 'No Pool Found', 'Create a pool first.');
  if (hosted.pool.status !== 'waiting') return send(message, 'Already Open', 'This pool is already open.');

  if (Number(args[0]) !== 1) {
    return send(message, 'Invalid Game', 'Available game: `1` — 3-Digit Match.');
  }

  hosted.pool.gameId = 1;
  hosted.pool.status = 'open';
  savePool(hosted.key, hosted.pool);

  return send(
    message,
    'Game Open',
    `**${hosted.pool.name}** is accepting players. Use \`${getPrefix(message, message.client)}poolbet 123\` to submit a number.`
  );
}

async function showList(message) {
  const active = [...pools.values()]
    .filter(pool => pool.guildId === String(message.guild.id))
    .map(pool => `**${pool.name}** — ${pool.players.size}/${MAX_PLAYERS} — ${pool.status}`);

  return send(message, 'Active Pools', active.join('\n') || 'No active pools.');
}

async function showInfo(message, args) {
  const name = args.join(' ');
  const pool = name
    ? pools.get(getKey(message.guild.id, name))
    : findJoinedPool(message.guild.id, message.author.id)?.pool;

  if (!pool) return send(message, 'Not Found', 'Specify a pool name or join a pool first.');

  return message.channel.send({
    embeds: [createPoolEmbed(pool)],
  });
}

async function invitePlayer(message, args, prefix) {
  const hosted = findHostedPool(message.guild.id, message.author.id);

  if (!hosted) return send(message, 'No Pool Found', 'You need to host the pool.');

  const pool = hosted.pool;

  if (pool.status !== 'open' || hasSubmitted(pool)) {
    return send(message, 'Pool Closed', 'Invite players before anyone submits a number.');
  }

  const target = resolveTarget(message, args.join(' '));

  if (!target) return send(message, 'Player Not Found', 'Mention a server member.');

  if (pool.players.has(target.id)) {
    return send(message, 'Already Joined', 'That member is already in the pool.');
  }

  if (pool.players.size >= MAX_PLAYERS) {
    return send(message, 'Pool Full', `Maximum ${MAX_PLAYERS} players.`);
  }

  try {
    await target.send({
      embeds: [
        makeEmbed(
          'Pool Invitation',
          `${message.member.displayName} invited you to **${pool.name}** in **${message.guild.name}**.\n` +
          `Join with \`${prefix}betpool join ${pool.name}\`.`
        ),
      ],
    });

    return send(message, 'Invite Sent', `Invitation sent to ${target}.`);

  } catch {
    return send(message, 'DM Failed', `Ask ${target} to join using \`${prefix}betpool join ${pool.name}\`.`);
  }
}

async function kickPlayer(message, args) {
  const hosted = findHostedPool(message.guild.id, message.author.id);

  if (!hosted) return send(message, 'No Pool Found', 'You need to host a pool.');

  const { key, pool } = hosted;

  if (pool.status !== 'open' || hasSubmitted(pool)) {
    return send(message, 'Too Late', 'Players can only be removed before submissions begin.');
  }

  const target = resolveTarget(message, args.join(' '));

  if (!target || target.id === pool.hostId || !pool.players.has(target.id)) {
    return send(message, 'Invalid Player', 'Mention a player in your pool, not yourself.');
  }

  pool.players.delete(target.id);
  savePool(key, pool);

  return send(message, 'Player Removed', `${target.displayName} was removed from **${pool.name}**.`);
}

async function deletePool(message, args) {
  const name = args.join(' ');

  if (!name) return send(message, 'Missing Name', 'Usage: `betpool delete <name>`');

  const key = getKey(message.guild.id, name);
  const pool = pools.get(key);

  if (!pool) return send(message, 'Not Found', 'That pool does not exist.');
  if (pool.hostId !== message.author.id) return send(message, 'Denied', 'Only the host can delete the pool.');

  deleteSession.run(key);
  pools.delete(key);

  return send(message, 'Pool Deleted', `**${pool.name}** was deleted.`);
}

async function showLeaderboard(message) {
  const rows = getLeaderboard.all(String(message.guild.id));

  if (!rows.length) {
    return send(message, 'Betpool Leaderboard', 'No competition points earned yet.');
  }

  const lines = rows.map((row, index) =>
    `**${index + 1}.** ${getPlayerName(message.guild, row.user_id)} — **${row.points} point(s)**`
  );

  return send(message, 'Betpool Leaderboard', lines.join('\n'));
}

async function help(message, prefix) {
  return send(
    message,
    'Betpool Help',
    `\`${prefix}betpool create <name>\` — create a pool\n` +
    `\`${prefix}betpool play 1\` — open the game\n` +
    `\`${prefix}betpool join <name>\` — join a pool\n` +
    `\`${prefix}poolbet 123\` — submit a number\n` +
    `\`${prefix}betpool info [name]\` — view a pool\n` +
    `\`${prefix}betpool list\` — list active pools\n` +
    `\`${prefix}betpool invite @user\` — invite a player\n` +
    `\`${prefix}betpool kick @user\` — kick a player\n` +
    `\`${prefix}betpool delete <name>\` — delete your pool\n` +
    `\`${prefix}betpool leaderboard\` — show points\n\n` +
    'Points and open pools are saved in economy.sqlite. No Crown stakes or payouts.'
  );
}

async function execute(client, message, args) {
  if (!message.guild || !message.member) return;

  const prefix = getPrefix(message, client);
  const content = message.content.trim();

  const commandText = content.startsWith(prefix)
    ? content.slice(prefix.length).trim()
    : content;

  const parts = commandText.split(/\s+/).filter(Boolean);
  const invoked = (parts.shift() || 'betpool').toLowerCase();

  if (invoked === 'poolbet') {
    return submitNumber(message, parts);
  }

  const action = (parts.shift() || 'help').toLowerCase();

  switch (action) {
    case 'create':
      return createPool(message, parts, prefix);

    case 'join':
      return joinPool(message, parts);

    case 'play':
      return selectGame(message, parts);

    case 'list':
      return showList(message);

    case 'info':
      return showInfo(message, parts);

    case 'invite':
      return invitePlayer(message, parts, prefix);

    case 'kick':
      return kickPlayer(message, parts);

    case 'delete':
      return deletePool(message, parts);

    case 'leaderboard':
    case 'points':
      return showLeaderboard(message);

    case 'help':
      return help(message, prefix);

    default:
      return help(message, prefix);
  }
}

module.exports = {
  name: 'betpool',
  aliases: ['bettingpool', 'poolbet'],
  description: 'Play a persistent three-digit competition game.',
  category: 'misc',
  usage: 'betpool <create|join|play|list|info|invite|kick|delete|leaderboard|help>',
  init,
  execute,
};