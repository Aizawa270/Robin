'use strict';

const {
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

const REQUIRED_CLAN_TABLES = [
  'clans',
  'clan_members',
  'clan_deposits',
  'clan_quests',
  'clan_quest_actors',
  'clan_quest_bonus',
  'clan_user_history',
  'clan_daily_pool',
  'clan_daily_stats',
  'clan_streaks',
  'clan_donors',
];

const SUPPORTED_GAMES = [
  'coinflip',
  'spinwheel',
  'dice',
  'blackjack',
  'farm',
];

const VALID_TYPES = [
  'sum',
  'distinct',
  'streak',
];

const VALID_CATEGORIES = [
  'economic',
  'gaming',
  'recruitment',
];

const MAX_FIELD_LENGTH = 1000;

function shorten(value, max = MAX_FIELD_LENGTH) {
  const text = String(value ?? 'Unknown');

  return text.length > max
    ? `${text.slice(0, max - 3)}...`
    : text;
}

function status(ok) {
  return ok ? '✅ PASS' : '❌ FAIL';
}

function safeError(error) {
  return shorten(
    error?.message || error || 'Unknown error',
    250
  );
}

module.exports = {
  name: 'diagnose',
  aliases: ['diag', 'diagnostics', 'healthcheck'],
  description: 'Runs read-only diagnostics on Vanessa.',
  category: 'mod',
  usage: '$diagnose',

  async execute(client, message) {
    // ========================================================
    // PERMISSION CHECK
    // ========================================================

    if (!message.guild) {
      return message.reply(
        'This command can only be used inside a server.'
      );
    }

    if (
      !message.member?.permissions?.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return message.reply(
        'You need Administrator permission to use this command.'
      );
    }

    const results = [];
    const problems = [];
    const warnings = [];

    const add = (name, ok, detail, severity = 'critical') => {
      results.push({
        name,
        ok,
        detail: shorten(detail, 350),
      });

      if (!ok) {
        if (severity === 'warning') {
          warnings.push(`${name}: ${detail}`);
        } else {
          problems.push(`${name}: ${detail}`);
        }
      }
    };

    // ========================================================
    // 1. CLAN SYSTEM RUNTIME
    // ========================================================

    const clanSystem = client.clanSystem;

    add(
      'Clan system',
      Boolean(clanSystem),
      clanSystem
        ? 'client.clanSystem is initialized.'
        : 'client.clanSystem is missing. Check clanService.init(client) in index.js.'
    );

    const clanMethods = clanSystem
      ? Object.keys(clanSystem).filter(
          key => typeof clanSystem[key] === 'function'
        )
      : [];

    add(
      'Clan service methods',
      clanMethods.length > 0,
      clanMethods.length
        ? clanMethods.join(', ')
        : 'No callable methods found on client.clanSystem.',
      'warning'
    );

    // ========================================================
    // 2. ECONOMY DATABASE CONNECTION
    // ========================================================

    const db = client.economyDB;

    add(
      'Economy database',
      Boolean(db?.open),
      db?.open
        ? `Connected${db.name ? ` (${db.name})` : ''}.`
        : 'client.economyDB is missing or the database is closed.'
    );

    let existingTables = new Set();
    let databaseUsable = false;

    if (db?.open) {
      try {
        const tableRows = db.prepare(`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
        `).all();

        existingTables = new Set(
          tableRows.map(row => row.name)
        );

        databaseUsable = true;

        add(
          'Database query',
          true,
          `Successfully read ${existingTables.size} database tables.`
        );
      } catch (error) {
        add(
          'Database query',
          false,
          safeError(error)
        );
      }
    } else {
      add(
        'Database query',
        false,
        'Skipped because the economy database is unavailable.'
      );
    }

    // ========================================================
    // 3. SQLITE INTEGRITY
    // ========================================================

    if (databaseUsable) {
      try {
        const integrityRows = db
          .prepare('PRAGMA quick_check')
          .all();

        const integrityMessages = integrityRows.map(row => {
          return Object.values(row).join(', ');
        });

        const integrityOK =
          integrityMessages.length > 0 &&
          integrityMessages.every(value => value === 'ok');

        add(
          'SQLite integrity',
          integrityOK,
          integrityMessages.join(' | ') || 'No integrity result returned.'
        );
      } catch (error) {
        add(
          'SQLite integrity',
          false,
          safeError(error)
        );
      }
    } else {
      add(
        'SQLite integrity',
        false,
        'Skipped because the database is unavailable.'
      );
    }

    // ========================================================
    // 4. REQUIRED CLAN TABLES
    // ========================================================

    if (databaseUsable) {
      const missingTables = REQUIRED_CLAN_TABLES.filter(
        table => !existingTables.has(table)
      );

      add(
        'Clan database tables',
        missingTables.length === 0,
        missingTables.length
          ? `Missing: ${missingTables.join(', ')}`
          : `All ${REQUIRED_CLAN_TABLES.length} required tables exist.`
      );

      // Read-only table counts.
      const countTables = [
        'clans',
        'clan_members',
        'clan_quests',
        'clan_daily_pool',
      ];

      const counts = [];

      for (const table of countTables) {
        if (!existingTables.has(table)) {
          counts.push(`${table}: missing`);
          continue;
        }

        try {
          const row = db.prepare(
            `SELECT COUNT(*) AS total FROM "${table}"`
          ).get();

          counts.push(`${table}: ${row.total}`);
        } catch (error) {
          counts.push(`${table}: ${safeError(error)}`);
        }
      }

      add(
        'Clan data counts',
        true,
        counts.join('\n'),
        'warning'
      );
    } else {
      add(
        'Clan database tables',
        false,
        'Could not inspect tables because the database is unavailable.'
      );
    }

    // ========================================================
    // 5. CLAN CONFIGURATION
    // ========================================================

    let config = null;

    try {
      config = require('../../handlers/clanConfig');

      add(
        'Clan config module',
        Boolean(config),
        'handlers/clanConfig.js loaded successfully.'
      );
    } catch (error) {
      add(
        'Clan config module',
        false,
        safeError(error)
      );
    }

    if (config) {
      const pool = config.QUEST_POOL;
      const poolErrors = [];

      if (!Array.isArray(pool) || pool.length === 0) {
        poolErrors.push('QUEST_POOL is missing or empty.');
      } else {
        const ids = new Set();
        const games = new Set();

        for (const quest of pool) {
          if (!quest || typeof quest !== 'object') {
            poolErrors.push('A quest entry is invalid.');
            continue;
          }

          if (!quest.id || typeof quest.id !== 'string') {
            poolErrors.push('A quest has no valid ID.');
          } else if (ids.has(quest.id)) {
            poolErrors.push(`Duplicate quest ID: ${quest.id}`);
          } else {
            ids.add(quest.id);
          }

          if (!VALID_CATEGORIES.includes(quest.cat)) {
            poolErrors.push(
              `${quest.id || 'Unknown quest'} has invalid category.`
            );
          }

          if (!VALID_TYPES.includes(quest.type)) {
            poolErrors.push(
              `${quest.id || 'Unknown quest'} has invalid type.`
            );
          }

          if (
            !quest.tier ||
            !config.QUEST_TIERS?.[quest.tier]
          ) {
            poolErrors.push(
              `${quest.id || 'Unknown quest'} has an invalid reward tier.`
            );
          }

          if (
            typeof quest.metric !== 'string' ||
            !Number.isFinite(Number(quest.target)) ||
            Number(quest.target) <= 0
          ) {
            poolErrors.push(
              `${quest.id || 'Unknown quest'} has an invalid metric or target.`
            );
          }

          if (typeof quest.text !== 'function') {
            poolErrors.push(
              `${quest.id || 'Unknown quest'} has no text function.`
            );
          }

          if (quest.cat === 'gaming') {
            if (!SUPPORTED_GAMES.includes(quest.game)) {
              poolErrors.push(
                `${quest.id || 'Unknown quest'} uses unsupported game: ${quest.game}`
              );
            } else {
              games.add(quest.game);
            }
          }
        }

        if (games.size < 2) {
          poolErrors.push(
            'Fewer than two supported gaming quest categories exist.'
          );
        }
      }

      const questCountValid =
        Number.isInteger(config.QUEST_COUNT) &&
        config.QUEST_COUNT > 0 &&
        Array.isArray(pool) &&
        config.QUEST_COUNT <= pool.length;

      if (!questCountValid) {
        poolErrors.push('QUEST_COUNT is invalid.');
      }

      add(
        'Quest pool validation',
        poolErrors.length === 0,
        poolErrors.length
          ? poolErrors.join('\n')
          : `${pool.length} quests validated successfully.`
      );

      if (Array.isArray(pool)) {
        const gameCount = new Set(
          pool
            .filter(q => q?.cat === 'gaming')
            .map(q => q.game)
            .filter(Boolean)
        ).size;

        add(
          'Gaming quest categories',
          gameCount >= 2,
          `${gameCount} game categories found: ${
            [...new Set(
              pool
                .filter(q => q?.cat === 'gaming')
                .map(q => q.game)
            )].join(', ') || 'none'
          }`,
          'warning'
        );
      }
    }

    // ========================================================
    // 6. CQ COMMAND BRIDGE
    // ========================================================

    try {
      const cqCommand = require('../economy/cq');

      add(
        '$cq command module',
        typeof cqCommand.execute === 'function',
        typeof cqCommand.execute === 'function'
          ? 'commands/economy/cq.js loaded and has an execute function.'
          : 'The CQ command has no execute function.'
      );

      add(
        '$cq alias',
        Array.isArray(cqCommand.aliases) &&
          cqCommand.aliases.includes('clanquest'),
        `Aliases: ${(cqCommand.aliases || []).join(', ') || 'none'}`,
        'warning'
      );
    } catch (error) {
      add(
        '$cq command module',
        false,
        safeError(error)
      );
    }

    // ========================================================
    // 7. CLAN COMMAND MODULE
    // ========================================================

    try {
      const clanCommand = require('../economy/clan');

      add(
        'Clan command module',
        typeof clanCommand.execute === 'function',
        typeof clanCommand.execute === 'function'
          ? 'commands/economy/clan.js loaded successfully.'
          : 'Clan command does not export execute().'
      );
    } catch (error) {
      add(
        'Clan command module',
        false,
        safeError(error)
      );
    }

    // ========================================================
    // 8. BUILD REPORT
    // ========================================================

    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    const reportLines = results.map(result => {
      return `${status(result.ok)} **${result.name}**\n${result.detail}`;
    });

    const problemText = problems.length
      ? problems.map(item => `• ${item}`).join('\n')
      : 'No critical problems detected.';

    const warningText = warnings.length
      ? warnings.map(item => `• ${item}`).join('\n')
      : 'No warnings.';

    const embed = new EmbedBuilder()
      .setColor(
        problems.length
          ? 0xC0392B
          : warnings.length
            ? 0xD4A017
            : 0x2ECC71
      )
      .setTitle('Vanessa System Diagnostics')
      .setDescription(
        [
          `**Server:** ${message.guild.name}`,
          `**Result:** ${passed} passed / ${failed} failed`,
          '',
          ...reportLines,
        ].join('\n')
      )
      .addFields(
        {
          name: 'Critical Problems',
          value: shorten(problemText),
        },
        {
          name: 'Warnings',
          value: shorten(warningText),
        }
      )
      .setFooter({
        text: 'Read-only diagnostic • No database changes were made',
      })
      .setTimestamp();

    return message.reply({
      embeds: [embed],
      allowedMentions: {
        repliedUser: false,
      },
    });
  },
};