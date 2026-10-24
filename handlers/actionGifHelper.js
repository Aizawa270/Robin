const {
    EmbedBuilder,
} = require('discord.js');

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// ================================
// CONFIGURATION
// ================================

const ALLOWED_ACTIONS = new Set([
    'hug',
    'kiss',
    'slap',
    'pat',
    'cuddle',
    'handhold',
]);

const GIFUKAI_ACTIONS = new Set([
    'hug',
    'kiss',
    'pat',
]);

const NEKOSBEST_API = 'https://nekos.best/api/v2';
const GIFUKAI_API = 'https://api.gifukai.com/v1';

const REQUEST_TIMEOUT = 12000;

// ================================
// DATABASE
// ================================

const dataDir = path.join(__dirname, '..', 'data');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(
    path.join(dataDir, 'action_gifs.sqlite')
);

db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS action_gif_usage (
        guild_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (
            guild_id,
            actor_id,
            target_id,
            action
        )
    );
`);

const getUsageStatement = db.prepare(`
    SELECT count
    FROM action_gif_usage
    WHERE guild_id = ?
      AND actor_id = ?
      AND target_id = ?
      AND action = ?
`);

const incrementUsageStatement = db.prepare(`
    INSERT INTO action_gif_usage (
        guild_id,
        actor_id,
        target_id,
        action,
        count
    )
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT (
        guild_id,
        actor_id,
        target_id,
        action
    )
    DO UPDATE SET count = count + 1
`);

function getUsageCount(guildId, actorId, targetId, action) {
    const row = getUsageStatement.get(
        guildId,
        actorId,
        targetId,
        action
    );

    return row ? row.count : 0;
}

function incrementUsage(guildId, actorId, targetId, action) {
    incrementUsageStatement.run(
        guildId,
        actorId,
        targetId,
        action
    );

    return getUsageCount(
        guildId,
        actorId,
        targetId,
        action
    );
}

// ================================
// ORDINAL NUMBERS
// ================================

function getOrdinal(number) {
    const remainder100 = number % 100;

    if (remainder100 >= 11 && remainder100 <= 13) {
        return `${number}th`;
    }

    switch (number % 10) {
        case 1:
            return `${number}st`;
        case 2:
            return `${number}nd`;
        case 3:
            return `${number}rd`;
        default:
            return `${number}th`;
    }
}

// ================================
// HTTP REQUESTS
// ================================

async function requestJson(url) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(
                `API returned HTTP ${response.status}`
            );
        }

        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function validateGifUrl(url) {
    if (typeof url !== 'string' || !url.trim()) {
        return null;
    }

    try {
        const parsedUrl = new URL(url);

        if (parsedUrl.protocol !== 'https:') {
            return null;
        }

        return parsedUrl.toString();
    } catch {
        return null;
    }
}

// ================================
// GIF API SOURCES
// ================================

async function getGifukaiGif(action) {
    if (!GIFUKAI_ACTIONS.has(action)) {
        return null;
    }

    try {
        const data = await requestJson(
            `${GIFUKAI_API}/${encodeURIComponent(action)}`
        );

        const possibleUrls = [
            data?.url,
            data?.gif,
            data?.data?.url,
            data?.result?.url,
            data?.results?.[0]?.url,
        ];

        for (const url of possibleUrls) {
            const validUrl = validateGifUrl(url);

            if (validUrl) {
                return validUrl;
            }
        }

        return null;
    } catch (error) {
        console.warn(
            `[ActionGIF] Gifukai failed for "${action}":`,
            error.message
        );

        return null;
    }
}

async function getNekosBestGif(action) {
    if (!ALLOWED_ACTIONS.has(action)) {
        return null;
    }

    try {
        const data = await requestJson(
            `${NEKOSBEST_API}/${encodeURIComponent(action)}`
        );

        const possibleUrls = [
            data?.results?.[0]?.url,
            data?.url,
            data?.data?.url,
        ];

        for (const url of possibleUrls) {
            const validUrl = validateGifUrl(url);

            if (validUrl) {
                return validUrl;
            }
        }

        return null;
    } catch (error) {
        console.warn(
            `[ActionGIF] NekosBest failed for "${action}":`,
            error.message
        );

        return null;
    }
}

// ================================
// FETCH ACTION GIF
// ================================

async function fetchActionGif(action) {
    if (!ALLOWED_ACTIONS.has(action)) {
        throw new Error(`Unsupported GIF action: ${action}`);
    }

    // Try Gifukai first for supported actions.
    if (GIFUKAI_ACTIONS.has(action)) {
        const gifukaiGif = await getGifukaiGif(action);

        if (gifukaiGif) {
            return gifukaiGif;
        }
    }

    // Fall back to NekosBest.
    const nekosBestGif = await getNekosBestGif(action);

    if (nekosBestGif) {
        return nekosBestGif;
    }

    throw new Error(
        `No GIF could be retrieved for action "${action}".`
    );
}

// ================================
// RESOLVE TARGET USER
// ================================

async function resolveTargetUser(message, args) {
    if (!args || args.length === 0) {
        return null;
    }

    const input = args.join(' ').trim();

    if (!input) {
        return null;
    }

    // Discord mention: <@123> or <@!123>
    const mentionMatch = input.match(/^<@!?(\d+)>$/);

    // Raw Discord ID.
    const idMatch = input.match(/^(\d{17,20})$/);

    const userId = mentionMatch?.[1] || idMatch?.[1];

    if (userId) {
        try {
            return await message.client.users.fetch(userId);
        } catch {
            return null;
        }
    }

    // Search cached guild members by username, display name,
    // nickname, or Discord tag.
    if (!message.guild) {
        return null;
    }

    const search = input.toLowerCase();

    const cachedMember = message.guild.members.cache.find(member => {
        const username = member.user.username?.toLowerCase();
        const displayName = member.displayName?.toLowerCase();
        const tag = member.user.tag?.toLowerCase();

        return (
            username === search ||
            displayName === search ||
            tag === search
        );
    });

    return cachedMember?.user || null;
}

// ================================
// EXECUTE ACTION
// ================================

async function executeAction(client, message, args, options = {}) {
    const {
        action,
        verb,
        title = 'Action!',
        selfMessage = 'You cannot target yourself!',
        usage,
    } = options;

    if (!message.guild) {
        return message.reply(
            'This command can only be used inside a server.'
        );
    }

    if (!ALLOWED_ACTIONS.has(action)) {
        console.error(
            `[ActionGIF] Unsupported action configured: ${action}`
        );

        return message.reply(
            'This action is not configured correctly.'
        );
    }

    if (!verb) {
        return message.reply(
            'This action is missing its configured verb.'
        );
    }

    const target = await resolveTargetUser(message, args);

    if (!target) {
        const usageText = usage || `${action} @user`;

        return message.reply(
            `Please mention a valid user.\nUsage: \`${usageText}\``
        );
    }

    if (target.id === message.author.id) {
        return message.reply(selfMessage);
    }

    // Retrieve the GIF before incrementing the usage count.
    let gifUrl;

    try {
        gifUrl = await fetchActionGif(action);
    } catch (error) {
        console.error(
            `[ActionGIF] Failed to fetch "${action}" GIF:`,
            error
        );

        return message.reply(
            'I could not fetch a GIF right now. Please try again later.'
        );
    }

    const count = incrementUsage(
        message.guild.id,
        message.author.id,
        target.id,
        action
    );

    const ordinal = getOrdinal(count);

    const actorName = message.member?.displayName
        || message.author.username;

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(title)
        .setDescription(
            `**${actorName}** ${verb} <@${target.id}> for the **${ordinal}** time!`
        )
        .setImage(gifUrl)
        .setFooter({
            text: `${action} • ${count} time${count === 1 ? '' : 's'}`,
        })
        .setTimestamp();

    try {
        return await message.reply({
            embeds: [embed],
            allowedMentions: {
                users: [target.id],
            },
        });
    } catch (error) {
        console.error(
            `[ActionGIF] Failed to send "${action}" embed:`,
            error
        );

        return message.reply(
            'I fetched the GIF, but could not send the embed.'
        ).catch(() => null);
    }
}

// ================================
// EXPORTS
// ================================

module.exports = {
    executeAction,
    fetchActionGif,
    resolveTargetUser,
    getOrdinal,
    db,
};