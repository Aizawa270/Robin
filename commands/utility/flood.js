const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Lazy init helper – only runs once per bot session
function ensureFloodInfra(client) {
    if (client._floodReady) return;

    // Open/Create flood DB
    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const db = new Database(path.join(dataDir, 'flood.sqlite'));
    db.pragma('journal_mode = WAL');
    db.prepare(`
        CREATE TABLE IF NOT EXISTS flood_access (
            guild_id TEXT NOT NULL,
            target_type TEXT NOT NULL DEFAULT 'user',
            target_id TEXT NOT NULL,
            PRIMARY KEY (guild_id, target_type, target_id)
        )
    `).run();
    client.floodDB = db;

    // Cache bot owner ID once
    client.application.fetch().then(app => {
        client.floodOwnerId = app.owner?.id ?? app.owner?.ownerId;
    }).catch(() => {});

    client._floodReady = true;
}

module.exports = {
    name: 'flood',
    description: 'Fast webhook flood with Vanessa webhooks. Subcommand: `access` to grant/revoke per-server access.',
    category: 'utility',
    hidden: true,
    usage: '$flood [channel/user] <amount> <text>  |  $flood access <@user|id>',
    async execute(client, message, args) {
        // Lazy init once
        ensureFloodInfra(client);

        // ---- SUBCOMMAND: access ----
        if (args[0]?.toLowerCase() === 'access') {
            // Only bot owner can manage access
            if (!client.floodOwnerId) {
                // Wait for owner ID if not yet cached
                try {
                    const app = await client.application.fetch();
                    client.floodOwnerId = app.owner?.id ?? app.owner?.ownerId;
                } catch {
                    return message.reply('Could not verify owner. Try again later.');
                }
            }
            if (message.author.id !== client.floodOwnerId) {
                return message.reply({
                    embeds: [new EmbedBuilder().setColor('#ff0000').setDescription('Only the bot owner can manage flood access.')]
                });
            }

            const targetArg = args[1];
            if (!targetArg) {
                return message.reply('Usage: `$flood access <@user|user_id>`');
            }

            let targetId;
            const mentionMatch = targetArg.match(/<@!?(\d+)>/);
            if (mentionMatch) targetId = mentionMatch[1];
            else if (/^\d+$/.test(targetArg)) targetId = targetArg;
            else return message.reply('Please provide a valid user mention or ID.');

            try { await client.users.fetch(targetId); } catch {
                return message.reply('Could not find that user.');
            }

            const guildId = message.guild.id;
            const row = client.floodDB.prepare(
                'SELECT 1 FROM flood_access WHERE guild_id = ? AND target_type = ? AND target_id = ?'
            ).get(guildId, 'user', targetId);

            if (row) {
                client.floodDB.prepare(
                    'DELETE FROM flood_access WHERE guild_id = ? AND target_type = ? AND target_id = ?'
                ).run(guildId, 'user', targetId);
                return message.reply({
                    embeds: [new EmbedBuilder().setColor('#00ff00').setDescription(`Removed flood access for <@${targetId}> in this server.`)]
                });
            } else {
                client.floodDB.prepare(
                    'INSERT OR IGNORE INTO flood_access (guild_id, target_type, target_id) VALUES (?, ?, ?)'
                ).run(guildId, 'user', targetId);
                return message.reply({
                    embeds: [new EmbedBuilder().setColor('#00ff00').setDescription(`Granted flood access to <@${targetId}> in this server.`)]
                });
            }
        }

        // ---- NORMAL FLOOD ----
        // Permission check (owner always allowed)
        const isOwner = message.author.id === client.floodOwnerId;
        let hasAccess = false;
        if (!isOwner) {
            const row = client.floodDB.prepare(
                'SELECT 1 FROM flood_access WHERE guild_id = ? AND target_type = ? AND target_id = ?'
            ).get(message.guild.id, 'user', message.author.id);
            hasAccess = !!row;
        }

        if (!isOwner && !hasAccess) {
            return message.reply({
                embeds: [new EmbedBuilder().setColor('#f472b6').setDescription("You're not that guy")]
            });
        }

        if (args.length < 2) {
            return message.reply(
                'Usage: `$flood [channel/user] <amount> <text>`\n' +
                'Examples:\n' +
                '`$flood #general 100 hello`\n' +
                '`$flood @User 50 test`\n' +
                '`$flood 100 spam` (current channel)'
            );
        }

        let targetChannel = message.channel;
        let targetUser = null;
        let targetDM = false;
        let amountIndex = 0;

        if (args[0]) {
            const channelMatch = args[0].match(/<#(\d+)>/);
            if (channelMatch) {
                const channelId = channelMatch[1];
                try {
                    const channel = await message.guild.channels.fetch(channelId);
                    if (channel && channel.isTextBased()) {
                        targetChannel = channel;
                        amountIndex = 1;
                    } else return message.reply('Invalid channel or channel is not text-based.');
                } catch {
                    return message.reply('Could not find that channel.');
                }
            } else if (args[0].match(/<@!?(\d+)>/)) {
                const userId = args[0].replace(/[<@!>]/g, '');
                try {
                    targetUser = await client.users.fetch(userId);
                    targetDM = true;
                    amountIndex = 1;
                } catch {
                    return message.reply('Could not find that user.');
                }
            } else if (/^\d+$/.test(args[0])) {
                try {
                    targetUser = await client.users.fetch(args[0]);
                    targetDM = true;
                    amountIndex = 1;
                } catch {}
            }
        }

        const amount = parseInt(args[amountIndex]);
        if (isNaN(amount) || amount < 1 || amount > 5000)
            return message.reply('Amount must be 1-5000.');

        const textArgs = args.slice(amountIndex + 1);
        const text = textArgs.join(' ');
        if (!text) return message.reply('Need text to send.');

        let targetDescription = targetDM
            ? `**Target:** ${targetUser.tag} (DM)`
            : `**Target:** ${targetChannel}`;

        const startEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('NUCLEAR FLOOD ACTIVATED')
            .setDescription(`${targetDescription}\n**Amount:** ${amount}\n**Text:** "${text}"`)
            .addFields(
                { name: 'Webhooks', value: '5x Vanessa', inline: true },
                { name: 'Method', value: 'Parallel Send', inline: true },
                { name: 'Status', value: 'Starting...', inline: true }
            )
            .setFooter({ text: 'Vanessa Flood System v3' })
            .setTimestamp();

        const startMsg = await message.reply({ embeds: [startEmbed] });
        const startTime = Date.now();

        try {
            if (targetDM) {
                let sent = 0, failed = 0;
                const updateProgress = async () => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;
                    const embed = new EmbedBuilder()
                        .setColor('#ffaa00')
                        .setTitle('DM FLOOD IN PROGRESS')
                        .setDescription(`**Target:** ${targetUser.tag}`)
                        .addFields(
                            { name: 'Sent', value: `${sent}/${amount}`, inline: true },
                            { name: 'Failed', value: `${failed}`, inline: true },
                            { name: 'Time', value: `${elapsed.toFixed(1)}s`, inline: true },
                            { name: 'Speed', value: `${speed}/sec`, inline: true },
                            { name: 'Progress', value: `${Math.round((sent/amount)*100)}%`, inline: true }
                        )
                        .setFooter({ text: 'Vanessa Flood System • Working...' })
                        .setTimestamp();
                    try { await startMsg.edit({ embeds: [embed] }); } catch {}
                };

                for (let i = 0; i < amount; i++) {
                    try {
                        await targetUser.send(text);
                        sent++;
                        if (sent % 25 === 0) await updateProgress();
                        if (sent % 5 === 0) await new Promise(r => setTimeout(r, 100));
                    } catch (error) {
                        failed++;
                        if (error.code === 50007 || error.message.includes('Cannot send messages to this user')) break;
                        if (error.code === 40001 || error.code === 40002) await new Promise(r => setTimeout(r, 1000));
                    }
                }

                const totalTime = (Date.now() - startTime) / 1000;
                const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;
                const result = new EmbedBuilder()
                    .setColor(sent >= amount ? '#00ff00' : '#ffaa00')
                    .setTitle(sent >= amount ? 'FLOOD COMPLETE' : 'FLOOD PARTIAL')
                    .setDescription(`**Target:** ${targetUser.tag}`)
                    .addFields(
                        { name: 'Success', value: `${sent}/${amount}`, inline: true },
                        { name: 'Failed', value: `${failed}`, inline: true },
                        { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
                        { name: 'Avg Speed', value: `${speed}/sec`, inline: true },
                        { name: 'Completion', value: `${Math.round((sent/amount)*100)}%`, inline: true }
                    )
                    .setFooter({ text: 'Vanessa Flood System • Job Done' })
                    .setTimestamp();
                await startMsg.edit({ embeds: [result] });
            } else {
                const webhooks = [];
                let sent = 0, failed = 0;
                for (let i = 0; i < 5; i++) {
                    try {
                        const webhook = await targetChannel.createWebhook({
                            name: 'Vanessa',
                            avatar: 'https://cdn.discordapp.com/attachments/852839588689870879/1214567890123456789/vanessa.png',
                            reason: 'Flood command'
                        });
                        webhooks.push(webhook);
                    } catch {}
                }
                if (webhooks.length === 0) throw new Error('Could not create any webhooks');

                const updateProgress = async () => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;
                    const embed = new EmbedBuilder()
                        .setColor('#ffaa00')
                        .setTitle('FLOOD IN PROGRESS')
                        .setDescription(`**Target:** ${targetChannel}`)
                        .addFields(
                            { name: 'Sent', value: `${sent}/${amount}`, inline: true },
                            { name: 'Failed', value: `${failed}`, inline: true },
                            { name: 'Time', value: `${elapsed.toFixed(1)}s`, inline: true },
                            { name: 'Speed', value: `${speed}/sec`, inline: true },
                            { name: 'Webhooks', value: `${webhooks.length} active`, inline: true },
                            { name: 'Progress', value: `${Math.round((sent/amount)*100)}%`, inline: true }
                        )
                        .setFooter({ text: 'Vanessa Flood System • Working...' })
                        .setTimestamp();
                    try { await startMsg.edit({ embeds: [embed] }); } catch {}
                };

                const floodWebhook = async (webhook) => {
                    let localSent = 0;
                    const maxPerWebhook = Math.ceil(amount / webhooks.length);
                    while (sent < amount && localSent < maxPerWebhook) {
                        try {
                            await webhook.send({
                                content: text,
                                username: 'Vanessa',
                                avatarURL: client.user.displayAvatarURL()
                            });
                            sent++;
                            localSent++;
                            if (sent % 25 === 0) await updateProgress();
                            if (sent % 5 === 0) await new Promise(r => setTimeout(r, 20));
                        } catch (err) {
                            failed++;
                            if (err.code === 10015 || err.code === 429) {
                                webhooks.splice(webhooks.indexOf(webhook), 1);
                                break;
                            }
                            await new Promise(r => setTimeout(r, 100));
                        }
                    }
                    return localSent;
                };

                await Promise.allSettled(webhooks.map(floodWebhook));

                for (const webhook of webhooks) try { await webhook.delete(); } catch {}

                const totalTime = (Date.now() - startTime) / 1000;
                const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;
                const result = new EmbedBuilder()
                    .setColor(sent >= amount ? '#00ff00' : '#ffaa00')
                    .setTitle(sent >= amount ? 'FLOOD COMPLETE' : 'FLOOD PARTIAL')
                    .setDescription(`**Target:** ${targetChannel}`)
                    .addFields(
                        { name: 'Success', value: `${sent}/${amount}`, inline: true },
                        { name: 'Failed', value: `${failed}`, inline: true },
                        { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
                        { name: 'Avg Speed', value: `${speed}/sec`, inline: true },
                        { name: 'Completion', value: `${Math.round((sent/amount)*100)}%`, inline: true },
                        { name: 'Webhooks Used', value: '5x Vanessa', inline: true }
                    )
                    .setFooter({ text: 'Vanessa Flood System • Job Done' })
                    .setTimestamp();
                await startMsg.edit({ embeds: [result] });
            }
        } catch (error) {
            const errEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('FLOOD FAILED')
                .setDescription(`**Error:** ${error.message}`)
                .setFooter({ text: 'Vanessa Flood System • Error' })
                .setTimestamp();
            await startMsg.edit({ embeds: [errEmbed] });
        }
    },
};