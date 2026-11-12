const { randomInt } = require('node:crypto');
const { createEmbed, resolveMember } = require('../../handlers/universalHelper');

// --------------------------------------------------
// GAY METER
// --------------------------------------------------

function getMeterLine(pct) {
    if (pct === 0) {
        return 'The meter detected absolutely no rainbow chaos today.';
    }

    if (pct < 25) {
        return 'A little rainbow energy. Nothing too suspicious.';
    }

    if (pct < 50) {
        return 'Somewhere in the middle. Interesting results.';
    }

    if (pct < 75) {
        return 'There is definitely some rainbow energy here.';
    }

    if (pct < 100) {
        return 'Very high levels. The meter is getting suspicious.';
    }

    return '**MAXIMUM GAY.** Legendary meter results. Off the charts.';
}

function createMeterEmbed(client, message, options = {}) {
    const embed = createEmbed(client, message, options);
    embed.setTimestamp();

    return embed;
}

// --------------------------------------------------
// COMMAND MODULE
// --------------------------------------------------

module.exports = {
    name: 'gay',
    aliases: ['gaymeter'],
    description: 'Check someone\'s random gay meter score.',
    category: 'misc',
    usage: '$gay [@user]',

    async execute(client, message, args) {
        if (!message.guild || !message.member) return;

        // Resolve a mentioned user, ID, or username.
        let target = message.mentions.members.first();

        if (!target && args.length) {
            target = await resolveMember(
                client,
                message,
                args.join(' ')
            );
        }

        // Default to the command author.
        if (!args.length) {
            target = message.member;
        }

        // Invalid target.
        if (!target) {
            const embed = createMeterEmbed(client, message, {
                title: '❌ User Not Found',
                description:
                    'I couldn\'t find that server member.\n\n' +
                    '**Example:** `$gay @user`',
            });

            return message.reply({ embeds: [embed] });
        }

        // Generate a random percentage from 0 to 100.
        const pct = randomInt(0, 101);

        // Build the progress bar.
        const filled = Math.round(pct / 10);
        const bar =
            '█'.repeat(filled) +
            '░'.repeat(10 - filled);

        const line = getMeterLine(pct);

        const embed = createMeterEmbed(client, message, {
            title: '✦ GAY METER ✦',
            description:
                `${target} rolled **${pct}%** on the Gay Meter.\n\n` +
                `\`${bar}\`\n\n` +
                `${line}\n\n` +
                '*Completely random. Just a joke, not a statement about anyone\'s actual identity.*',

            thumbnail: target.displayAvatarURL({ size: 256 }),

            footer: {
                text: `Requested by ${message.member.displayName}`,
                iconURL: message.author.displayAvatarURL(),
            },
        });

        return message.reply({
            embeds: [embed],
        });
    },
};