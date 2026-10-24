const economy = require('../../handlers/economy');
const universalHelper = require('../../handlers/universalHelper');

// ============================================================
// VANESSA HORSE RACING — PERSISTENT POINTS-ONLY VERSION
// Compatible with handlers/commandHandler.js.
// Competition points and unfinished races are persisted between restarts.
// Race results update the competition leaderboard.
// ============================================================

const RACE_TIMER_MS = 30_000;
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 2;
const db = economy.db;

// Share the persistent score table with bettingpool.js, using a separate game key.
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

const getPointsStmt = db.prepare(`
  SELECT points FROM game_competition_points
  WHERE game = 'horserace' AND guild_id = ? AND user_id = ?
`);

const addPointStmt = db.prepare(`
  INSERT INTO game_competition_points (game, guild_id, user_id, points, updated_at)
  VALUES ('horserace', ?, ?, ?, ?)
  ON CONFLICT(game, guild_id, user_id) DO UPDATE SET
    points = game_competition_points.points + excluded.points,
    updated_at = excluded.updated_at
`);

const getLeaderboardStmt = db.prepare(`
  SELECT user_id, points
  FROM game_competition_points
  WHERE game = 'horserace' AND guild_id = ? AND points > 0
  ORDER BY points DESC, updated_at ASC, user_id ASC
  LIMIT 10
`);

const saveSessionStmt = db.prepare(`
  INSERT INTO horserace_sessions (guild_id, channel_id, host_id, payload, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    channel_id = excluded.channel_id,
    host_id = excluded.host_id,
    payload = excluded.payload,
    updated_at = excluded.updated_at
`);

const deleteSessionStmt = db.prepare(
  'DELETE FROM horserace_sessions WHERE guild_id = ?'
);

function createEmbed(title, description, context) {
  const guild = context?.guild || null;
  const client = context?.client || guild?.client;

  if (!client || !guild) {
    throw new Error('HorseRace embed requires a Discord client and guild context.');
  }

  // Use Vanessa's shared embed helper for the configured theme colour and
  // the current server prefix.
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

class HorseRaceManager {
  constructor() {
    this.activeRaces = new Map();
    this.autoStartTasks = new Map();
    this.resolvingRaces = new Set();
    this.client = null;
  }

  getHorses() {
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

  serializeRace(race) {
    return {
      prefix: race.prefix || '$',
      status: race.status,
      startedAt: Number(race.startedAt) || Date.now(),
      messageId: race.message?.id || race.messageId || null,

      players: [...race.players.entries()].map(([userId, selection]) => ({
        userId: String(userId),
        horseId: Number(selection.horseId),
        joinedAt: Number(selection.joinedAt) || Date.now(),
      })),
    };
  }

  saveRace(race) {
    saveSessionStmt.run(
      String(race.guild.id),
      String(race.channel.id),
      String(race.hostId),
      JSON.stringify(this.serializeRace(race)),
      Date.now()
    );
  }

  deleteRace(guildId) {
    deleteSessionStmt.run(String(guildId));
    this.activeRaces.delete(String(guildId));
  }

  calculatePerformance(horse) {
    const base =
      horse.speed * 0.4 +
      horse.stamina * 0.3 +
      horse.luck * 0.3;

    const randomFactor = 0.85 + Math.random() * 0.30;

    return Math.min(100, base * randomFactor);
  }

  simulateRace(horses) {
    const results = horses.map(horse => ({
      horse,
      performance: this.calculatePerformance(horse),
      position: 0,
    }));

    results.sort((a, b) => b.performance - a.performance);

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

  createRaceEmbed(race) {
    const prefix = getPrefix(
      { guild: race.guild },
      this.client
    );

    const chosenPlayers = [...race.players.values()];
    const playerCount = chosenPlayers.length;

    let statusText;

    if (race.status === 'open') {
      const remaining = Math.max(
        0,
        Math.ceil(
          (race.startedAt + RACE_TIMER_MS - Date.now()) / 1000
        )
      );

      statusText = `Accepting players • ${remaining}s remaining`;
    } else if (race.status === 'running') {
      statusText = 'The race is underway!';
    } else if (race.status === 'finished') {
      statusText = 'Race finished';
    } else {
      statusText = 'Race cancelled';
    }

    const embed = createEmbed(
      'HORSE RACING | THUNDERDOME DERBY',
      'Choose your horse before the timer runs out!',
      {
        client: this.client,
        guild: race.guild,
      }
    ).addFields({
      name: 'RACE STATUS',
      value:
        `Players: **${playerCount}/${MAX_PLAYERS}**\n` +
        `Minimum: **${MIN_PLAYERS} players**\n` +
        `Status: **${statusText}**`,
      inline: false,
    }).setTimestamp();

    const horsesText = race.horses.map(horse => {
      const count = chosenPlayers.filter(
        player => player.horseId === horse.id
      ).length;

      return (
        `**${horse.id}.** ${horse.emoji} ${horse.name} — ` +
        `${count} player${count === 1 ? '' : 's'}`
      );
    });

    embed.addFields({
      name: '🏇 CONTESTANTS',
      value: horsesText.join('\n'),
      inline: false,
    });

    if (race.players.size > 0) {
      const playerLines = [];

      for (const [userId, selection] of race.players) {
        const member = race.guild.members.cache.get(userId);

        const horse = race.horses.find(
          item => item.id === selection.horseId
        );

        playerLines.push(
          `${member?.displayName || `<@${userId}>`} → ` +
          `${horse ? `${horse.emoji} ${horse.name}` : 'Unknown horse'}`
        );
      }

      embed.addFields({
        name: '👥 PLAYER CHOICES',
        value: playerLines.join('\n').slice(0, 1024),
        inline: false,
      });
    } else {
      embed.addFields({
        name: '👥 PLAYER CHOICES',
        value: 'Nobody has chosen a horse yet.',
        inline: false,
      });
    }

    embed.addFields({
      name: 'HOW TO ENTER',
      value:
        `Use \`${prefix}horserace choose <1-6>\` to choose your horse.\n` +
        `The race starts after 30 seconds or when ${MAX_PLAYERS} players have chosen.\n` +
        `At least ${MIN_PLAYERS} players are needed.`,
      inline: false,
    });

    embed.setFooter({
      text: `${race.guild.name} • Horse Racing`,
    });

    return embed;
  }

  createResultEmbed(race, results, winners) {
    const winningPosition = results[0]?.position ?? 1;

    const winningHorses = results.filter(
      result => result.position === winningPosition
    );

    const winnerHorseNames = winningHorses
      .map(result => `${result.horse.emoji} **${result.horse.name}**`)
      .join('\n');

    const embed = createEmbed(
      'HORSE RACING | RESULTS',
      winners.length > 0
        ? '🏆 The race is over! Congratulations to the winning players.'
        : '🏁 The race is over, but nobody picked a winning horse.',
      {
        client: this.client,
        guild: race.guild,
      }
    ).addFields({
      name: winningHorses.length > 1
        ? '🏆 TIED WINNING HORSES'
        : '🏆 WINNING HORSE',
      value: winnerHorseNames || 'No result available.',
      inline: false,
    }).setTimestamp();

    const resultsText = results.map(result => {
      const { horse, performance, position } = result;

      const barLength = 10;

      const filled = Math.max(
        0,
        Math.min(
          barLength,
          Math.round((performance / 100) * barLength)
        )
      );

      const bar =
        '█'.repeat(filled) +
        '░'.repeat(barLength - filled);

      let place;

      if (position === 1) {
        place = '1st';
      } else if (position === 2) {
        place = '2nd';
      } else if (position === 3) {
        place = '3rd';
      } else {
        place = `${position}th`;
      }

      return (
        `**${place}** ${horse.emoji} ${horse.name}\n` +
        `\`[${bar}]\` ${performance.toFixed(1)}%`
      );
    });

    embed.addFields({
      name: '📊 RACE RESULTS',
      value: resultsText.join('\n\n').slice(0, 1024),
      inline: false,
    });

    if (winners.length > 0) {
      const winnersText = winners.map(userId => {
        const member = race.guild.members.cache.get(userId);

        return (
          `🏅 **${member?.displayName || `<@${userId}>`}** — ` +
          `+1 point (Total: ${this.getPoints(race.guild.id, userId)})`
        );
      });

      embed.addFields({
        name: '🎉 WINNING PLAYERS',
        value: winnersText.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    embed.setFooter({
      text: `${race.guild.name} • Race Finished`,
    });

    return embed;
  }

  async init(client) {
    this.client = client;

    const rows = db.prepare(
      'SELECT * FROM horserace_sessions'
    ).all();

    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload);

        const guild =
          client.guilds.cache.get(row.guild_id) ||
          await client.guilds.fetch(row.guild_id).catch(() => null);

        if (!guild) {
          console.warn(
            `[HorseRace] Could not restore race for guild ${row.guild_id}: guild unavailable.`
          );
          continue;
        }

        const channel =
          guild.channels.cache.get(row.channel_id) ||
          await guild.channels.fetch(row.channel_id).catch(() => null);

        if (!channel || !channel.isTextBased()) {
          console.warn(
            `[HorseRace] Could not restore race for guild ${row.guild_id}: channel unavailable.`
          );
          continue;
        }

        let raceMessage = null;

        if (payload.messageId) {
          raceMessage = await channel.messages
            .fetch(payload.messageId)
            .catch(() => null);
        }

        const race = {
          guild,
          channel,
          hostId: String(row.host_id),
          prefix: payload.prefix || '$',
          horses: this.getHorses(),

          players: new Map(
            (payload.players || []).map(player => [
              String(player.userId),
              {
                horseId: Number(player.horseId),
                joinedAt: Number(player.joinedAt) || Date.now(),
              },
            ])
          ),

          status: String(payload.status || 'open'),
          startedAt: Number(payload.startedAt) || Date.now(),
          message: raceMessage,
          messageId: payload.messageId || null,
        };

        this.activeRaces.set(String(guild.id), race);
      } catch (error) {
        console.error(
          `[HorseRace] Could not restore race for guild ${row.guild_id}:`,
          error
        );
      }
    }

    console.log(
      `[HorseRace] Restored ${this.activeRaces.size} active race(s).`
    );

    for (const [guildId, race] of [...this.activeRaces.entries()]) {
      if (race.status === 'running') {
        // Resume a stored race that was interrupted during its animation.
        runRace(guildId).catch(error =>
          console.error('[HorseRace] Resume failed:', error)
        );
      } else if (race.status === 'open') {
        const remaining =
          race.startedAt + RACE_TIMER_MS - Date.now();

        if (remaining <= 0 || race.players.size >= MAX_PLAYERS) {
          runRace(guildId).catch(error =>
            console.error('[HorseRace] Resume failed:', error)
          );
        } else {
          scheduleRace(guildId, race, remaining);
        }
      } else {
        this.deleteRace(guildId);
      }
    }
  }
}

const raceManager = new HorseRaceManager();

function clearAutoStart(guildId) {
  const key = String(guildId);

  const timer = raceManager.autoStartTasks.get(key);

  if (timer) clearTimeout(timer);

  raceManager.autoStartTasks.delete(key);
}

function scheduleRace(guildId, race, delay) {
  clearAutoStart(guildId);

  const key = String(guildId);

  const timer = setTimeout(async () => {
    raceManager.autoStartTasks.delete(key);

    const currentRace = raceManager.activeRaces.get(key);

    if (
      !currentRace ||
      currentRace !== race ||
      currentRace.status !== 'open'
    ) {
      return;
    }

    try {
      await runRace(key);
    } catch (error) {
      console.error('[HorseRace] Timer failed:', error);
    }
  }, Math.max(0, delay));

  timer.unref?.();

  raceManager.autoStartTasks.set(key, timer);
}

async function refreshRaceMessage(race) {
  if (!race.message) return;

  await race.message.edit({
    embeds: [raceManager.createRaceEmbed(race)],
  }).catch(() => {});
}

async function startRace(message) {
  const guildId = String(message.guild.id);

  if (raceManager.activeRaces.has(guildId)) {
    return send(
      message,
      'Race Already Active',
      'A race is already open or running in this server. Wait for it to finish.'
    );
  }

  const race = {
    guild: message.guild,
    channel: message.channel,
    hostId: message.author.id,
    prefix: getPrefix(message, message.client),
    horses: raceManager.getHorses(),
    players: new Map(),
    status: 'open',
    startedAt: Date.now(),
    message: null,
    messageId: null,
  };

  raceManager.activeRaces.set(guildId, race);

  try {
    race.message = await message.channel.send({
      content: '🏁 **A new horse race is open!** Choose your horse now.',
      embeds: [raceManager.createRaceEmbed(race)],
    });

    race.messageId = race.message.id;

    raceManager.saveRace(race);
  } catch (error) {
    raceManager.deleteRace(guildId);

    console.error(
      '[HorseRace] Could not create race message:',
      error
    );

    return;
  }

  scheduleRace(guildId, race, RACE_TIMER_MS);

  return send(
    message,
    'Race Started',
    `The 30-second entry window is open!\n` +
    `Choose a horse with \`${race.prefix}horserace choose <1-6>\`.\n` +
    'The host must also choose a horse to participate.\n' +
    `Minimum players: ${MIN_PLAYERS}. Maximum players: ${MAX_PLAYERS}.`
  );
}

async function chooseHorse(message, args) {
  const guildId = String(message.guild.id);

  const race = raceManager.activeRaces.get(guildId);

  if (!race) {
    return send(
      message,
      'No Active Race',
      `Start one with \`${getPrefix(message, message.client)}horserace start\`.`
    );
  }

  if (race.status !== 'open') {
    return send(
      message,
      'Race Closed',
      'You cannot choose a horse because the race has already started.'
    );
  }

  const input = args[0];

  if (args.length !== 1 || !/^[1-6]$/.test(input || '')) {
    const horseList = race.horses
      .map(horse => `**${horse.id}.** ${horse.emoji} ${horse.name}`)
      .join('\n');

    return send(
      message,
      'Choose a Horse',
      `Use \`${race.prefix}horserace choose <number>\`.\n\n${horseList}`
    );
  }

  if (race.players.has(message.author.id)) {
    const previousHorse = race.horses.find(
      horse => horse.id === race.players.get(message.author.id).horseId
    );

    return send(
      message,
      'Already Entered',
      `You have already chosen **${previousHorse?.name || 'a horse'}**. You cannot change your selection this race.`
    );
  }

  if (race.players.size >= MAX_PLAYERS) {
    return send(
      message,
      'Race Full',
      `This race already has ${MAX_PLAYERS} players.`
    );
  }

  const horseId = Number(input);

  const horse = race.horses.find(
    item => item.id === horseId
  );

  if (!horse) {
    return send(
      message,
      'Horse Not Found',
      'Choose a horse numbered 1 to 6.'
    );
  }

  race.players.set(message.author.id, {
    horseId,
    joinedAt: Date.now(),
  });

  raceManager.saveRace(race);

  await refreshRaceMessage(race);

  await send(
    message,
    'Horse Selected',
    `${message.author} chose ${horse.emoji} **${horse.name}**!\n` +
    `Players entered: **${race.players.size}/${MAX_PLAYERS}**.\n` +
    'Your selection is locked for this race.'
  );

  if (race.players.size >= MAX_PLAYERS) {
    clearAutoStart(guildId);
    await runRace(guildId);
  }
}

async function runRace(guildId) {
  const key = String(guildId);

  const race = raceManager.activeRaces.get(key);

  if (
    !race ||
    raceManager.resolvingRaces.has(key)
  ) {
    return;
  }

  if (race.status !== 'open' && race.status !== 'running') {
    return;
  }

  raceManager.resolvingRaces.add(key);
  clearAutoStart(key);

  try {
    if (race.players.size < MIN_PLAYERS) {
      race.status = 'cancelled';

      raceManager.saveRace(race);

      await refreshRaceMessage(race);

      await race.channel.send({
        embeds: [
          createEmbed(
            'Race Cancelled',
            `Only **${race.players.size}** player(s) chose a horse. ` +
            `At least **${MIN_PLAYERS}** players are needed.`,
            {
              client: raceManager.client,
              guild: race.guild,
            }
          ),
        ],
      }).catch(() => {});

      raceManager.deleteRace(key);
      return;
    }

    // Save the running state before asynchronous work, so startup can resume it.
    race.status = 'running';

    raceManager.saveRace(race);

    await refreshRaceMessage(race);

    await race.channel.send({
      embeds: [
        createEmbed(
          '🏁 And They’re Off!',
          `The Thunderdome Derby has started with **${race.players.size}** players!\n` +
          'The horses are racing...',
          {
            client: raceManager.client,
            guild: race.guild,
          }
        ),
      ],
    }).catch(() => {});

    await new Promise(resolve => setTimeout(resolve, 2000));

    const results = raceManager.simulateRace(race.horses);

    const topPosition = results[0]?.position ?? 1;

    const winningHorseIds = new Set(
      results
        .filter(result => result.position === topPosition)
        .map(result => result.horse.id)
    );

    const winners = [];

    for (const [userId, selection] of race.players) {
      if (winningHorseIds.has(selection.horseId)) {
        winners.push(userId);
      }
    }

    // Award points and delete the saved session in one transaction.
    // This prevents the same saved race from awarding points twice.
    db.transaction(() => {
      for (const userId of winners) {
        addPointStmt.run(
          String(race.guild.id),
          String(userId),
          1,
          Date.now()
        );
      }

      deleteSessionStmt.run(key);
    })();

    race.status = 'finished';

    await refreshRaceMessage(race);

    try {
      await race.channel.send({
        embeds: [
          raceManager.createResultEmbed(
            race,
            results,
            winners
          ),
        ],
      });
    } catch (error) {
      console.error(
        '[HorseRace] Could not send results:',
        error
      );
    }

    raceManager.activeRaces.delete(key);
  } catch (error) {
    console.error(
      '[HorseRace] Race resolution failed:',
      error
    );

    // If an error happened before the score transaction, retain the session.
    if (race.status === 'running') {
      raceManager.saveRace(race);
    }
  } finally {
    raceManager.resolvingRaces.delete(key);
    clearAutoStart(key);
  }
}

async function raceInfo(message) {
  const race = raceManager.activeRaces.get(
    String(message.guild.id)
  );

  if (!race) {
    return send(
      message,
      'No Active Race',
      `Start one with \`${getPrefix(message, message.client)}horserace start\`.`
    );
  }

  return message.channel.send({
    embeds: [raceManager.createRaceEmbed(race)],
  });
}

async function raceCancel(message) {
  const guildId = String(message.guild.id);

  const race = raceManager.activeRaces.get(guildId);

  if (!race) {
    return send(
      message,
      'No Active Race',
      'There is no active race to cancel.'
    );
  }

  if (message.author.id !== race.hostId) {
    return send(
      message,
      'Permission Denied',
      'Only the race host can cancel the race.'
    );
  }

  if (race.status !== 'open') {
    return send(
      message,
      'Race Already Started',
      'A race cannot be cancelled after it starts.'
    );
  }

  clearAutoStart(guildId);

  race.status = 'cancelled';

  raceManager.saveRace(race);

  await refreshRaceMessage(race);

  raceManager.deleteRace(guildId);

  return send(
    message,
    'Race Cancelled',
    `The race started by ${message.author} has been cancelled. No competition points were awarded.`
  );
}

async function showLeaderboard(message) {
  const entries = getLeaderboardStmt.all(
    String(message.guild.id)
  );

  if (!entries.length) {
    return send(
      message,
      'Horse Racing Leaderboard',
      'Nobody has earned any horse racing points yet. Start a race to compete!'
    );
  }

  const lines = entries.map((entry, index) => {
    const member = message.guild.members.cache.get(
      entry.user_id
    );

    return (
      `**${index + 1}.** ` +
      `${member?.displayName || `<@${entry.user_id}>`} — ` +
      `**${entry.points} point(s)**`
    );
  });

  return message.channel.send({
    embeds: [
      createEmbed(
        '🏆 HORSE RACING LEADERBOARD',
        lines.join('\n'),
        message
      ).setFooter({
        text: `${message.guild.name} • Horse Racing Leaderboard`,
      }),
    ],
  });
}

async function raceHelp(message) {
  const prefix = getPrefix(message, message.client);

  const embed = createEmbed(
    'HORSE RACING GUIDE',
    'Compete with your server in the Thunderdome Derby!',
    message
  ).addFields(
    {
      name: '🏁 HOW TO PLAY',
      value:
        `**1. Start a race**\n\`${prefix}horserace start\`\n\n` +
        `**2. Choose a horse**\n\`${prefix}horserace choose 3\`\n\n` +
        '**3. Wait for the race**\n' +
        'The entry window lasts 30 seconds. The race starts sooner if 10 players enter.\n\n' +
        '**4. Earn points**\n' +
        'Players who selected a winning horse earn 1 competition point.',
      inline: false,
    },
    {
      name: '🐎 THE SIX HORSES',
      value:
        '**1.** Thunderbolt — Balanced racer\n' +
        '**2.** Shadowfax — Speed-focused\n' +
        '**3.** Midnight Star — Stamina-focused\n' +
        '**4.** Golden Arrow — All-rounder\n' +
        '**5.** Stormbringer — Fast racer\n' +
        '**6.** Silver Flash — Luck-focused',
      inline: false,
    },
    {
      name: '📜 RACE RULES',
      value:
        `• Minimum **${MIN_PLAYERS}** players.\n` +
        `• Maximum **${MAX_PLAYERS}** players.\n` +
        '• Each player chooses one horse and cannot change it.\n' +
        '• The host must also choose a horse to participate.\n' +
        '• If fewer than 2 players enter in time, the race is cancelled.\n' +
        '• Players selecting tied winning horses each earn 1 point.',
      inline: false,
    },
    {
      name: '⌨️ COMMANDS',
      value:
        `\`${prefix}horserace start\` — Start a race\n` +
        `\`${prefix}horserace choose <1-6>\` — Choose a horse\n` +
        `\`${prefix}horserace info\` — View the active race\n` +
        `\`${prefix}horserace cancel\` — Cancel your race (host only)\n` +
        `\`${prefix}horserace leaderboard\` — View points\n` +
        `\`${prefix}horserace help\` — Show this guide`,
      inline: false,
    }
  ).setFooter({
    text: `${message.guild.name} • Horse Racing`,
  });

  return message.channel.send({
    embeds: [embed],
  });
}

async function initializeHorseRace(client) {
  return raceManager.init(client);
}

module.exports = {
  name: 'horserace',
  aliases: ['horse', 'horsegame', 'race'],
  description: 'Run a persistent horse race competition with your server.',
  category: 'misc',
  usage: 'horserace <start|choose|info|cancel|leaderboard|help>',
  raceManager,
  init: initializeHorseRace,

  async execute(client, message, args) {
    if (!message.guild || !message.member) return;

    const action = (args[0] || 'help').toLowerCase();
    const subArgs = args.slice(1);

    switch (action) {
      case 'start':
        return startRace(message);

      case 'choose':
      case 'bet':
        return chooseHorse(message, subArgs);

      case 'info':
        return raceInfo(message);

      case 'cancel':
        return raceCancel(message);

      case 'leaderboard':
      case 'points':
        return showLeaderboard(message);

      case 'help':
        return raceHelp(message);

      default:
        return send(
          message,
          'Unknown Command',
          `Use \`${getPrefix(message, client)}horserace help\` to see the available commands.`
        );
    }
  },
};