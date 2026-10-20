const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// ============================================================
// FETCH
// ============================================================

let fetchFn = global.fetch;

if (!fetchFn) {
    try {
        fetchFn = require('node-fetch');
    } catch {}
}

// ============================================================
// CONFIGURATION
// ============================================================

let config = null;

try {
    config = require('../config');
} catch {}

const DEFAULT_COLOR =
    config?.colors?.theme ||
    config?.colors?.banner ||
    '#ec4899';

const REQUEST_TIMEOUT_MS = 10000;

const ALLOWED_ACTIONS = new Set([
    'hug',
    'kiss',
    'slap',
]);

// ============================================================
// DATABASE
// ============================================================

const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(
    path.join(DATA_DIR, 'action_gifs.sqlite')
);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.prepare(`
    CREATE TABLE IF NOT EXISTS action_counts (
        guild_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER NOT NULL DEFAULT 0,

        PRIMARY KEY (
            guild_id,
            actor_id,
            target_id,
            action
        )
    )
`).run();

// ============================================================
// NEKOSBEST USER-AGENT
// Generated automatically. No .env configuration required.
// ============================================================

function getUserAgent(client) {
    const botId = client?.user?.id;

    if (botId) {
        const inviteUrl =
            `https://discord.com/oauth2/authorize` +
            `?client_id=${botId}&scope=bot`;

        return `Vanessa (${inviteUrl})`;
    }

    return 'Vanessa (https://discord.com)';
}

// ============================================================
// API REQUEST
// ============================================================

async function requestJson(url, headers = {}) {
    if (!fetchFn) {
        throw new Error('Fetch is unavailable.');
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetchFn(url, {
            method: 'GET',

            headers: {
                Accept: 'application/json',
                ...headers,
            },

            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status} from ${url}`
            );
        }

        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

// ============================================================
// GIF SOURCES
// ============================================================

function getGifSources(action, client) {
    const sources = [];

    // Gifukai is the primary provider for hug and kiss.
    // It requires neither an API key nor custom configuration.

    if (action === 'hug' || action === 'kiss') {
        sources.push({
            name: 'Gifukai',

            url: `https://api.gifukai.com/v1/${action}`,

            headers: {},

            extract(data) {
                return data?.url;
            },
        });
    }

    // NekosBest supports hug, kiss, and slap.
    // The User-Agent is generated automatically.

    sources.push({
        name: 'NekosBest',

        url: `https://nekos.best/api/v2/${action}`,

        headers: {
            'User-Agent': getUserAgent(client),
        },

        extract(data) {
            return data?.results?.[0]?.url;
        },
    });

    return sources;
}

// ============================================================
// FETCH ACTION GIF
// ============================================================

async function fetchActionGif(action, client) {
    if (!ALLOWED_ACTIONS.has(action)) {
        throw new Error(
            `Unsupported action: ${action}`
        );
    }

    const sources = getGifSources(action, client);

    let lastError = null;

    for (const source of sources) {
        try {
            const data = await requestJson(
                source.url,
                source.headers
            );

            const gifUrl = source.extract(data);

            if (
                typeof gifUrl !== 'string' ||
                !gifUrl.trim()
            ) {
                throw new Error(
                    `${source.name} returned no GIF URL.`
                );
            }

            let parsedUrl;

            try {
                parsedUrl = new URL(gifUrl);
            } catch {
                throw new Error(
                    `${source.name} returned an invalid URL.`
                );
            }

            if (parsedUrl.protocol !== 'https:') {
                throw new Error(
                    `${source.name} returned a non-HTTPS URL.`
                );
            }

            return parsedUrl.toString();
        } catch (error) {
            lastError = error;

            console.warn(
                `[ActionGIF] ${source.name} failed for "${action}":`,
                error.message
            );
        }
    }

    throw new Error(
        `All GIF sources failed for "${action}". ` +
        `${lastError?.message || 'Unknown error.'}`
    );
}

// ============================================================
// RESOLVE TARGET USER
// ============================================================

async function resolveTargetUser(client, message, args) {
    const mentionedUser =
        message.mentions?.users?.first();

    if (mentionedUser) {
        return mentionedUser;
    }

    const input = args?.[0];

    if (!input) {
        return null;
    }

    // Use the universal resolver from commandHandler.js.

    if (typeof message.resolveUser === 'function') {
        try {
            return await message.resolveUser(input);
        } catch {
            return null;
        }
    }

    // Fallback resolver.

    const raw = String(input).trim();

    if (!raw) {
        return null;
    }

    const mentionMatch = raw.match(
        /^<@!?(\d{15,20})>$/
    );

    const userId = mentionMatch
        ? mentionMatch[1]
        : raw;

    if (/^\d{15,20}$/.test(userId)) {
        const cached = client.users.cache.get(userId);

        if (cached) {
            return cached;
        }

        return await client.users
            .fetch(userId)
            .catch(() => null);
    }

    const lowered = raw.toLowerCase();

    return (
        client.users.cache.find(user => (
            user.username?.toLowerCase() === lowered ||
            user.globalName?.toLowerCase() === lowered ||
            user.tag?.toLowerCase() === lowered
        )) || null
    );
}

// ============================================================
// ORDINAL NUMBERS
// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ...
// ============================================================

function getOrdinal(number) {
    const value = Math.abs(Number(number));

    const lastTwoDigits = value % 100;

    if (
        lastTwoDigits >= 11 &&
        lastTwoDigits <= 13
    ) {
        return `${value}th`;
    }

    switch (value % 10) {
        case 1:
            return `${value}st`;

        case 2:
            return `${value}nd`;

        case 3:
            return `${value}rd`;

        default:
            return `${value}th`;
    }
}

// ============================================================
// DATABASE COUNTERS
// ============================================================

const incrementActionStmt = db.prepare(`
    INSERT INTO action_counts (
        guild_id,
        actor_id,
        target_id,
        action,
        count,
        last_used_at
    )
    VALUES (?, ?, ?, ?, 1, ?)

    ON CONFLICT (
        guild_id,
        actor_id,
        target_id,
        action
    )
    DO UPDATE SET
        count = action_counts.count + 1,
        last_used_at = excluded.last_used_at
`);

const getActionCountStmt = db.prepare(`
    SELECT count
    FROM action_counts
    WHERE guild_id = ?
      AND actor_id = ?
      AND target_id = ?
      AND action = ?
`);

const incrementAndGetCount = db.transaction(
    (guildId, actorId, targetId, action) => {
        incrementActionStmt.run(
            guildId,
            actorId,
            targetId,
            action,
            Date.now()
        );

        const result = getActionCountStmt.get(
            guildId,
            actorId,
            targetId,
            action
        );

        return Number(result?.count || 0);
    }
);

// ============================================================
// EMBED BUILDER
// ============================================================

function makeEmbed(message, options = {}) {
    let embed;

    if (typeof message.createEmbed === 'function') {
        embed = message.createEmbed({
            title: options.title,
            description: options.description,
            image: options.image,
        });
    } else {
        embed = new EmbedBuilder()
            .setColor(DEFAULT_COLOR)
            .setTitle(options.title)
            .setDescription(options.description);

        if (options.image) {
            embed.setImage(options.image);
        }
    }

    embed.setTimestamp();

    return embed;
}

// ============================================================
// EXECUTE ACTION
// ============================================================

async function executeAction(
    client,
    message,
    args,
    options
) {
    const {
        action,
        verb,
        title,
        selfMessage,
    } = options;

    // --------------------------------------------------------
    // SERVER ONLY
    // --------------------------------------------------------

    if (!message.guild) {
        return message.reply(
            'You can only use this command in a server.'
        );
    }

    // --------------------------------------------------------
    // RESOLVE TARGET
    // --------------------------------------------------------

    const target = await resolveTargetUser(
        client,
        message,
        args
    );

    if (!target) {
        const prefix = message.prefix || '$';

        const embed = makeEmbed(message, {
            title: `${title} Usage`,

            description:
                `Please provide a user.\n` +
                `Example: \`${prefix}${action} @User\``,
        });

        return message.reply({
            embeds: [embed],

            allowedMentions: {
                parse: [],
            },
        });
    }

    // --------------------------------------------------------
    // PREVENT SELF-TARGETING
    // --------------------------------------------------------

    if (target.id === message.author.id) {
        return message.reply(selfMessage);
    }

    // --------------------------------------------------------
    // FETCH GIF
    // --------------------------------------------------------

    let gifUrl;

    try {
        gifUrl = await fetchActionGif(
            action,
            client
        );
    } catch (error) {
        console.error(
            `[ActionGIF] ${action} failed:`,
            error
        );

        return message.reply(
            `I couldn't fetch a ${action} GIF right now. ` +
            'Please try again later.'
        );
    }

    // --------------------------------------------------------
    // UPDATE PERSISTENT COUNTER
    // --------------------------------------------------------

    let count;

    try {
        count = incrementAndGetCount(
            String(message.guild.id),
            String(message.author.id),
            String(target.id),
            action
        );
    } catch (error) {
        console.error(
            `[ActionGIF] Counter update failed for "${action}":`,
            error
        );

        return message.reply(
            'Something went wrong while saving the action counter.'
        );
    }

    // --------------------------------------------------------
    // BUILD RESULT EMBED
    // --------------------------------------------------------

    const ordinal = getOrdinal(count);

    const description =
        `${message.author} ${verb} ${target} ` +
        `for the **${ordinal}** time!`;

    const embed = makeEmbed(message, {
        title,
        description,
        image: gifUrl,
    });

    // --------------------------------------------------------
    // SEND RESULT
    // --------------------------------------------------------

    return message.reply({
        embeds: [embed],

        // Prevent the action from pinging either user.

        allowedMentions: {
            parse: [],
        },
    });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    executeAction,
    fetchActionGif,
    resolveTargetUser,
    getOrdinal,
    db,
};