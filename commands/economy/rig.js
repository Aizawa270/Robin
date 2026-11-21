'use strict';

const { EmbedBuilder } = require('discord.js');

// Active rigs are stored per server and user.
// They remain active until turned off or the bot restarts.
const activeDiceRigs = new Set();

function getRigKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function setDiceRig(guildId, userId) {
    if (!guildId || !userId) return false;

    activeDiceRigs.add(getRigKey(guildId, userId));
    return true;
}

function clearDiceRig(guildId, userId) {
    if (!guildId || !userId) return false;

    return activeDiceRigs.delete(getRigKey(guildId, userId));
}

function isDiceRigged(guildId, userId) {
    if (!guildId || !userId) return false;

    return activeDiceRigs.has(getRigKey(guildId, userId));
}

// Checks whether the user is the bot owner.
function isBotOwner(userId, client) {
    if (!userId) return false;

    const ownerIds = new Set();

    const envOwners = [
        process.env.OWNER_ID,
        process.env.OWNER_IDS,
        process.env.BOT_OWNER_ID,
        process.env.BOT_OWNER_IDS
    ];

    for (const value of envOwners) {
        if (!value) continue;

        value.split(/[\s,]+/).forEach(id => {
            if (id.trim()) ownerIds.add(id.trim());
        });
    }

    const configOwners = [
        client?.ownerId,
        client?.ownerID,
        client?.config?.ownerId,
        client?.config?.ownerID,
        client?.config?.owner,
        client?.settings?.ownerId,
        client?.settings?.ownerID
    ];

    for (const value of configOwners) {
        if (!value) continue;

        String(value).split(/[\s,]+/).forEach(id => {
            if (id.trim()) ownerIds.add(id.trim());
        });
    }

    const applicationOwner = client?.application?.owner;

    if (applicationOwner?.id) {
        ownerIds.add(applicationOwner.id);
    }

    if (applicationOwner?.members) {
        for (const member of applicationOwner.members.values()) {
            const id = member?.user?.id || member?.id;
            if (id) ownerIds.add(id);
        }
    }

    return ownerIds.has(userId);
}

function getTargetId(message, args) {
    const mentionedUser = message.mentions.users.first();

    if (mentionedUser) {
        return mentionedUser.id;
    }

    const targetArg = args[1];

    if (!targetArg) return null;

    const match = targetArg.match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);

    return match ? (match[1] || match[2]) : null;
}

async function sendTemporaryEmbed(message, embed) {
    try {
        const sent = await message.channel.send({
            embeds: [embed]
        });

        setTimeout(() => {
            sent.delete().catch(() => {});
        }, 4000);

    } catch (error) {
        console.error('[RIG] Failed to send confirmation:', error);
    }
}

module.exports = {
    name: 'rig',
    aliases: [],
    description: 'Owner-only persistent dice rig controls.',
    usage: '$rig dice @user | $rig off @user',

    // Intentionally no category property.

    isBotOwner,
    isDiceRigged,
    setDiceRig,
    clearDiceRig,

    async execute(message, args = [], client) {
        try {
            if (!message.guild) return;

            client = client || message.client;

            // Only the bot owner can use this command.
            if (!isBotOwner(message.author.id, client)) return;

            const action = args[0]?.toLowerCase();
            const targetId = getTargetId(message, args);

            if (!action || !targetId) return;

            // Activate rig.
            if (action === 'dice') {
                setDiceRig(message.guild.id, targetId);

                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('Dice Rig Activated')
                    .setDescription(
                        `The dice rig has been enabled for <@${targetId}>.\n\n` +
                        `**Status:** Active\n` +
                        `**Server:** ${message.guild.name}`
                    )
                    .setTimestamp();

                return sendTemporaryEmbed(message, embed);
            }

            // Deactivate rig.
            if (action === 'off') {
                const removed = clearDiceRig(message.guild.id, targetId);

                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('Dice Rig Disabled')
                    .setDescription(
                        removed
                            ? `The dice rig has been disabled for <@${targetId}>.`
                            : `There was no active dice rig for <@${targetId}>.`
                    )
                    .setTimestamp();

                return sendTemporaryEmbed(message, embed);
            }

        } catch (error) {
            console.error('[RIG] Command error:', error);
        }
    }
};