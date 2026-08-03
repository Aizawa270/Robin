const { EmbedBuilder } = require('discord.js');

function makeEmbed(color, title, description) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

module.exports = {
    name: 'vote',
    aliases: ['topgg', 'upvote'],
    description: 'View or configure the Top.gg vote link.',
    category: 'info',
    usage: '$vote | $vote setup <top.gg link>',

    async execute(client, message, args) {

        if (!message.guild) {
            return message.reply({
                embeds: [
                    makeEmbed(
                        '#ef4444',
                        'Vote Failed',
                        'This command can only be used in a server.'
                    )
                ]
            });
        }

        if (!client.prefixDB) {
            return message.reply({
                embeds: [
                    makeEmbed(
                        '#ef4444',
                        'Database Error',
                        'The settings database is unavailable.'
                    )
                ]
            });
        }

        client.prefixDB.prepare(`
        CREATE TABLE IF NOT EXISTS vote_settings (
            guild_id TEXT PRIMARY KEY,
            vote_url TEXT NOT NULL
        )
        `).run();

        const sub = (args[0] || '').toLowerCase();

        // ============================
        // SETUP
        // ============================

        if (sub === 'setup') {

            const isBotOwner =
                client.application?.owner?.id === message.author.id ||
                message.author.id === process.env.BOT_OWNER_ID;

            const isServerOwner =
                message.guild.ownerId === message.author.id;

            if (!isBotOwner && !isServerOwner) {
                return message.reply({
                    embeds: [
                        makeEmbed(
                            '#ef4444',
                            'Permission Denied',
                            'Only the **bot owner** or the **server owner** can configure the vote link.'
                        )
                    ]
                });
            }

            const url = args[1];

            if (!url) {
                return message.reply({
                    embeds: [
                        makeEmbed(
                            '#f59e0b',
                            'Missing Link',
                            'Usage:\n`$vote setup https://top.gg/discord/servers/.../vote`'
                        )
                    ]
                });
            }

            if (
                !url.startsWith('https://top.gg/') &&
                !url.startsWith('http://top.gg/')
            ) {
                return message.reply({
                    embeds: [
                        makeEmbed(
                            '#ef4444',
                            'Invalid Link',
                            'Please provide a valid **Top.gg** vote URL.'
                        )
                    ]
                });
            }

            client.prefixDB.prepare(`
                INSERT OR REPLACE INTO vote_settings
                (guild_id, vote_url)
                VALUES (?, ?)
            `).run(
                message.guild.id,
                url
            );

            return message.reply({
                embeds: [
                    makeEmbed(
                        '#22c55e',
                        'Vote Link Updated',
                        'The server vote link has been saved successfully.'
                    )
                ]
            });
        }

        // ============================
        // NORMAL VOTE COMMAND
        // ============================

        const row = client.prefixDB.prepare(`
            SELECT vote_url
            FROM vote_settings
            WHERE guild_id = ?
        `).get(message.guild.id);

        if (!row) {
            return message.reply({
                embeds: [
                    makeEmbed(
                        '#f59e0b',
                        'Vote Not Configured',
                        'The server owner has not configured a Top.gg vote link yet.'
                    )
                ]
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setAuthor({
                name: `Vote for ${message.guild.name}`,
                iconURL: message.guild.iconURL() || undefined
            })
            .setTitle('Click here to vote!')
            .setURL(row.vote_url)
            .setDescription(
                '**Support this server by voting on Top.gg!**\n\n' +
                'Every vote helps the community grow.\n\n' +
                '💜 Thank you for your support!'
            )
            .setFooter({
                text: 'You can vote once every 24 hours.'
            })
            .setTimestamp();

        return message.reply({
            embeds: [embed]
        });
    }
};