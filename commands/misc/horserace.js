const { EmbedBuilder } = require('discord.js');
const economy = require('../../handlers/economy');

const db = economy.db;

const COLOR = 0x2b2d31;
const RACE_TIMER_MS = 30_000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

const races = new Map();
const timers = new Map();
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
  CREATE TABLE IF NOT EXISTS horserace_sessions (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    host_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`).run();

const saveSession = db.prepare(`
  INSERT INTO horserace_sessions
    (guild_id, channel_id, host_id, payload, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    channel_id = excluded.channel_id,
    host_id = excluded.host_id,
    payload = excluded.payload,
    updated_at = excluded.updated_at
`);

const deleteSession = db.prepare(`
  DELETE FROM horserace_sessions WHERE guild_id = ?
`);

const addPoint = db.prepare(`
  INSERT INTO game_competition_points
    (game, guild_id, user_id, points, updated_at)
  VALUES ('horserace', ?, ?, 1, ?)
  ON CONFLICT(game, guild_id, user_id) DO UPDATE SET
    points = game_competition_points.points + 1,
    updated_at = excluded.updated_at
`);

const getLeaderboard = db.prepare(`
  SELECT user_id, points
  FROM game_competition_points
  WHERE game = 'horserace' AND guild_id = ? AND points > 0
  ORDER BY points DESC, updated_at ASC
  LIMIT 10
`);

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

function getHorses() {
  return [
    {
      id: 1,
      name: 'Thunderbolt',
      emoji: '🐎',
      speed: 85,
      stamina: 80,
      luck: 75,
    },
    {
      id: 2,
      name: 'Shadowfax',
      emoji: '🐎',
      speed: 90,
      stamina: 70,
      luck: 80,
    },
    {
      id: 3,
      name: 'Midnight Star',
      emoji: '🐎',
      speed: 75,
      stamina: 95,
      luck: 70,
    },
    {
      id: 4,
      name: 'Golden Arrow',
      emoji: '🐎',
      speed: 88,
      stamina: 75,
      luck: 77,
    },
    {
      id: 5,
      name: 'Stormbringer',
      emoji: '🐎',
      speed: 92,
      stamina: 68,
      luck: 80,
    },
    {
      id: 6,
      name: 'Silver Flash',
      emoji: '🐎',
      speed: 78,
      stamina: 85,
      luck: 82,
    },
  ];
}

function serializeRace(race) {
  return {
    prefix: race.prefix,
    status: race.status,
    startedAt: race.startedAt,
    messageId: race.messageId || null,
    players: [...race.players.entries()].map(([userId, player]) => ({
      userId,
      horseId: player.horseId,
      joinedAt: player.joinedAt,
    })),
  };
}

function saveRace(race) {
  saveSession.run(
    String(race.guildId),
    String(race.channelId),
    String(race.hostId),
    JSON.stringify(serializeRace(race)),
    Date.now()
  );
}

function clearTimer(guildId) {
  guildId = String(guildId);

  const timer = timers.get(guildId);

  if (timer) {
    clearTimeout(timer);
    timers.delete(guildId);
  }
}

function deleteRace(guildId) {
  guildId = String(guildId);

  clearTimer(guildId);
  deleteSession.run(guildId);
  races.delete(guildId);
}

function scheduleRace(guildId, race, delay) {
  guildId = String(guildId);

  clearTimer(guildId);

  const timer = setTimeout(() => {
    timers.delete(guildId);

    const currentRace = races.get(guildId);

    if (currentRace !== race) {
      return;
    }

    runRace(guildId).catch(error => {
      console.error('[HorseRace] Scheduled race failed:', error);
    });
  }, Math.max(0, delay));

  timer.unref?.();
  timers.set(guildId, timer);
}

function createRaceEmbed(race) {
  const remaining = Math.max(
    0,
    Math.ceil(
      (race.startedAt + RACE_TIMER_MS - Date.now()) / 1000
    )
  );

  const horses = race.horses.map(horse => {
    const count = [...race.players.values()].filter(
      player => player.horseId === horse.id
    ).length;

    return (
      `**${horse.id}.** ${horse.emoji} ${horse.name}` +
      ` — ${count} player(s)`
    );
  });

  const playerLines = [...race.players.entries()].map(
    ([userId, player]) => {
      const horse = race.horses.find(
        item => item.id === player.horseId
      );

      return `${getPlayerName(race.guild, userId)} → ${
        horse ? horse.name : 'Unknown horse'
      }`;
    }
  );

  let statusText;

  if (race.status === 'open') {
    statusText = `Accepting entries • ${remaining}s remaining`;
  } else if (race.status === 'running') {
    statusText = 'The race is underway!';
  } else {
    statusText = race.status;
  }

  return makeEmbed(
    'HORSE RACING | THUNDERDOME DERBY',
    `**Status:** ${statusText}\n` +
    `**Players:** ${race.players.size}/${MAX_PLAYERS}\n` +
    `**Minimum:** ${MIN_PLAYERS} players\n\n` +
    `**Horses**\n${horses.join('\n')}\n\n` +
    `**Player choices**\n${playerLines.join('\n') || 'Nobody has chosen a horse yet.'}\n\n` +
    `Choose with \`${race.prefix}horserace choose <1-6>\`.\n` +
    'Winners earn competition points. Crowns are not used.'
  ).setFooter({
    text: `${race.guild.name} • Persistent competition points`,
  });
}

function simulateRace() {
  const results = getHorses()
    .map(horse => {
      const base =
        horse.speed * 0.4 +
        horse.stamina * 0.3 +
        horse.luck * 0.3;

      const randomFactor = 0.85 + Math.random() * 0.30;

      return {
        horse,
        performance: Math.min(100, base * randomFactor),
        position: 0,
      };
    })
    .sort((a, b) => b.performance - a.performance);

  results.forEach((result, index) => {
    if (
      index > 0 &&
      Math.abs(
        result.performance - results[index - 1].performance
      ) < 0.5
    ) {
      result.position = results[index - 1].position;
    } else {
      result.position = index + 1;
    }
  });

  return results;
}

async function refreshRaceMessage(race) {
  if (!race.messageId) {
    return;
  }

  const message = await race.channel.messages
    .fetch(race.messageId)
    .catch(() => null);

  if (!message) {
    return;
  }

  await message.edit({
    embeds: [createRaceEmbed(race)],
  }).catch(error => {
    console.error('[HorseRace] Could not refresh race message:', error);
  });
}

async function runRace(guildId) {
  guildId = String(guildId);

  const race = races.get(guildId);

  if (
    !race ||
    resolving.has(guildId) ||
    !['open', 'running'].includes(race.status)
  ) {
    return;
  }

  clearTimer(guildId);
  resolving.add(guildId);

  try {
    if (race.players.size < MIN_PLAYERS) {
      deleteRace(guildId);

      await race.channel.send({
        embeds: [
          makeEmbed(
            'Race Cancelled',
            `Only **${race.players.size}** player(s) entered.\n` +
            `At least **${MIN_PLAYERS}** are needed. No points awarded.`
          ),
        ],
      }).catch(() => {});

      return;
    }

    race.status = 'running';
    saveRace(race);

    await refreshRaceMessage(race);

    await race.channel.send({
      embeds: [
        makeEmbed(
          '🏁 And They’re Off!',
          `The race is underway with **${race.players.size}** players!`
        ),
      ],
    }).catch(() => {});

    await new Promise(resolve => setTimeout(resolve, 1500));

    const results = simulateRace();
    const winningPosition = results[0].position;

    const winningHorseIds = new Set(
      results
        .filter(result => result.position === winningPosition)
        .map(result => result.horse.id)
    );

    const winners = [...race.players.entries()]
      .filter(([, player]) => winningHorseIds.has(player.horseId))
      .map(([userId]) => userId);

    // Award points and delete the active session in one transaction.
    db.transaction(() => {
      for (const userId of winners) {
        addPoint.run(
          String(guildId),
          String(userId),
          Date.now()
        );
      }

      deleteSession.run(String(guildId));
    })();

    races.delete(guildId);

    const resultLines = results.map(result => {
      const place =
        result.position === 1 ? '1st'
          : result.position === 2 ? '2nd'
            : result.position === 3 ? '3rd'
              : `${result.position}th`;

      const barLength = Math.max(
        0,
        Math.min(10, Math.round(result.performance / 10))
      );

      const bar =
        '█'.repeat(barLength) +
        '░'.repeat(10 - barLength);

      return (
        `**${place}** ${result.horse.emoji} **${result.horse.name}**\n` +
        `\`[${bar}]\` ${result.performance.toFixed(1)}%`
      );
    });

    const winnerLines = winners.map(userId => {
      const row = db.prepare(`
        SELECT points
        FROM game_competition_points
        WHERE game = 'horserace'
          AND guild_id = ?
          AND user_id = ?
      `).get(String(guildId), String(userId));

      return (
        `${getPlayerName(race.guild, userId)} — ` +
        `+1 point (total ${Number(row?.points || 0)})`
      );
    });

    const tiedHorses = results
      .filter(result => result.position === winningPosition)
      .map(result => result.horse.name)
      .join(', ');

    await race.channel.send({
      embeds: [
        makeEmbed(
          'HORSE RACING | RESULTS',
          `**Winning horse(s):** ${tiedHorses}\n\n` +
          `**Race results**\n${resultLines.join('\n\n').slice(0, 3000)}\n\n` +
          `**Winning players**\n${winnerLines.join('\n') || 'Nobody selected a winning horse.'}`
        ).setFooter({
          text: `${race.guild.name} • Crowns are untouched`,
        }),
      ],
    }).catch(error => {
      console.error('[HorseRace] Could not send results:', error);
    });

  } catch (error) {
    console.error('[HorseRace] Race resolution failed:', error);

  } finally {
    resolving.delete(guildId);
  }
}

async function init(client) {
  const rows = db.prepare(`
    SELECT * FROM horserace_sessions
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
        console.warn(`[HorseRace] Could not restore race in guild ${row.guild_id}.`);
        continue;
      }

      const race = {
        guildId: String(row.guild_id),
        channelId: String(row.channel_id),
        hostId: String(row.host_id),
        guild,
        channel,
        prefix: payload.prefix || client.getPrefix?.(row.guild_id) || '$',
        status: payload.status || 'open',
        startedAt: Number(payload.startedAt) || Date.now(),
        messageId: payload.messageId || null,
        players: new Map(
          (payload.players || []).map(player => [
            String(player.userId),
            {
              horseId: Number(player.horseId),
              joinedAt: Number(player.joinedAt) || Date.now(),
            },
          ])
        ),
        horses: getHorses(),
      };

      races.set(race.guildId, race);

    } catch (error) {
      console.error('[HorseRace] Restore error:', error);
    }
  }

  console.log(`[HorseRace] Restored ${races.size} race(s).`);

  for (const [guildId, race] of [...races]) {
    const remaining =
      race.startedAt + RACE_TIMER_MS - Date.now();

    if (
      race.status === 'running' ||
      remaining <= 0 ||
      race.players.size >= MAX_PLAYERS
    ) {
      runRace(guildId).catch(error => {
        console.error('[HorseRace] Resume error:', error);
      });
    } else {
      scheduleRace(guildId, race, remaining);
    }
  }
}

async function startRace(message, client) {
  const guildId = String(message.guild.id);

  if (races.has(guildId)) {
    return send(
      message,
      'Race Already Active',
      'Wait for the current race to finish.'
    );
  }

  const race = {
    guildId,
    channelId: String(message.channel.id),
    hostId: String(message.author.id),
    guild: message.guild,
    channel: message.channel,
    prefix: getPrefix(message, client),
    status: 'open',
    startedAt: Date.now(),
    messageId: null,
    players: new Map(),
    horses: getHorses(),
  };

  races.set(guildId, race);
  saveRace(race);

  try {
    const raceMessage = await message.channel.send({
      content: '🏁 **A new race is open! Choose your horse now.**',
      embeds: [createRaceEmbed(race)],
    });

    race.messageId = raceMessage.id;
    saveRace(race);

    scheduleRace(guildId, race, RACE_TIMER_MS);

  } catch (error) {
    deleteRace(guildId);

    console.error('[HorseRace] Could not create race message:', error);

    return send(
      message,
      'Error',
      'I could not create the race message. Check Vanessa’s channel permissions.'
    );
  }

  return send(
    message,
    'Race Started',
    `You have 30 seconds to choose a horse with \`${race.prefix}horserace choose <1-6>\`.\n` +
    `Minimum: ${MIN_PLAYERS} players. Maximum: ${MAX_PLAYERS} players.\n` +
    'This game awards competition points only.'
  );
}

async function chooseHorse(message, args) {
  const guildId = String(message.guild.id);
  const race = races.get(guildId);

  if (!race) {
    return send(
      message,
      'No Active Race',
      `Start one with \`${getPrefix(message, message.client)}horserace start\`.`
    );
  }

  if (race.status !== 'open') {
    return send(message, 'Race Closed', 'Entries have closed.');
  }

  if (args.length !== 1 || !/^[1-6]$/.test(args[0] || '')) {
    return send(
      message,
      'Invalid Horse',
      `Choose a horse numbered 1 to 6 with \`${race.prefix}horserace choose <1-6>\`.`
    );
  }

  if (race.players.has(message.author.id)) {
    return send(message, 'Already Entered', 'You already chose a horse for this race.');
  }

  if (race.players.size >= MAX_PLAYERS) {
    return send(message, 'Race Full', 'This race has reached its player limit.');
  }

  const horseId = Number(args[0]);
  const horse = race.horses.find(item => item.id === horseId);

  if (!horse) {
    return send(message, 'Horse Not Found', 'Choose a horse numbered 1 to 6.');
  }

  race.players.set(message.author.id, {
    horseId,
    joinedAt: Date.now(),
  });

  saveRace(race);

  await refreshRaceMessage(race);

  await send(
    message,
    'Horse Selected',
    `You chose ${horse.emoji} **${horse.name}**. Your selection is locked.`
  );

  if (race.players.size >= MAX_PLAYERS) {
    clearTimer(guildId);
    return runRace(guildId);
  }
}

async function showRaceInfo(message) {
  const race = races.get(String(message.guild.id));

  if (!race) {
    return send(message, 'No Active Race', 'There is no active race.');
  }

  return message.channel.send({
    embeds: [createRaceEmbed(race)],
  });
}

async function cancelRace(message) {
  const guildId = String(message.guild.id);
  const race = races.get(guildId);

  if (!race) {
    return send(message, 'No Active Race', 'There is no active race to cancel.');
  }

  if (race.hostId !== message.author.id) {
    return send(message, 'Permission Denied', 'Only the race host can cancel it.');
  }

  if (race.status !== 'open') {
    return send(message, 'Race Already Running', 'A running race cannot be cancelled.');
  }

  deleteRace(guildId);

  return send(message, 'Race Cancelled', 'The race was cancelled. No points were awarded.');
}

async function showLeaderboard(message) {
  const rows = getLeaderboard.all(String(message.guild.id));

  if (!rows.length) {
    return send(message, 'Horse Racing Leaderboard', 'No competition points earned yet.');
  }

  const lines = rows.map((row, index) =>
    `**${index + 1}.** ${getPlayerName(message.guild, row.user_id)} — **${row.points} point(s)**`
  );

  return send(message, 'Horse Racing Leaderboard', lines.join('\n'));
}

async function showHelp(message, prefix) {
  return send(
    message,
    'HORSE RACING GUIDE',
    `\`${prefix}horserace start\` — start a race\n` +
    `\`${prefix}horserace choose <1-6>\` — choose a horse\n` +
    `\`${prefix}horserace info\` — view the active race\n` +
    `\`${prefix}horserace cancel\` — host cancels an open race\n` +
    `\`${prefix}horserace leaderboard\` — view competition points\n` +
    `\`${prefix}horserace help\` — show this guide\n\n` +
    `Players: ${MIN_PLAYERS}-${MAX_PLAYERS}. Entry window: 30 seconds.\n` +
    'Competition points and active races are saved in economy.sqlite. Crowns are untouched.'
  );
}

async function execute(client, message, args) {
  if (!message.guild || !message.member) {
    return;
  }

  const prefix = getPrefix(message, client);
  const action = (args[0] || 'help').toLowerCase();
  const subArgs = args.slice(1);

  switch (action) {
    case 'start':
      return startRace(message, client);

    case 'choose':
    case 'bet':
      return chooseHorse(message, subArgs);

    case 'info':
      return showRaceInfo(message);

    case 'cancel':
      return cancelRace(message);

    case 'leaderboard':
    case 'points':
      return showLeaderboard(message);

    case 'help':
      return showHelp(message, prefix);

    default:
      return showHelp(message, prefix);
  }
}

module.exports = {
  name: 'horserace',
  aliases: ['horse', 'horsegame', 'race'],
  description: 'Run a persistent horse-racing competition.',
  category: 'misc',
  usage: 'horserace <start|choose|info|cancel|leaderboard|help>',
  init,
  execute,
};