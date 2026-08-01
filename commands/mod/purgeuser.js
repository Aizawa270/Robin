const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// ===== USER RESOLVER (consistent across all mod commands) =====
async function resolveTargetUser(client, message, raw) {
    if (!raw) return null;

    // If the bot has a universal resolveUser helper (e.g. injected by a handler), use it
    if (typeof message.resolveUser === 'function') {
        return await message.resolveUser(raw);
    }

    const query = String(raw).trim();
    if (!query) return null;

    // Mention or raw ID
    const id = query.replace(/[<@!>]/g, '');
    if (/^\d{15,20}$/.test(id)) {
        const cached = client.users.cache.get(id);
        if (cached) return cached;
        return await client.users.fetch(id).catch(() => null);
    }

    const lowered = query.toLowerCase();

    // Exact match on username or global name from cache
    const cachedUser = client.users.cache.find(u =>
        u?.username?.toLowerCase() === lowered ||
        u?.globalName?.toLowerCase() === lowered
    );
    if (cachedUser) return cachedUser;

    // Guild member search (exact match first, then partial fallback)
    if (message.guild) {
        // Ensure we have the full member list
        await message.guild.members.fetch().catch(() => {});

        let member = message.guild.members.cache.find(m =>
            m?.displayName?.toLowerCase() === lowered ||
            m?.user?.username?.toLowerCase() === lowered ||
            m?.user?.globalName?.toLowerCase() === lowered
        );

        // Partial match fallback
        if (!member) {
            member = message.guild.members.cache.find(m =>
                m?.displayName?.toLowerCase().includes(lowered) ||
                m?.user?.username?.toLowerCase().includes(lowered) ||
                m?.user?.globalName?.toLowerCase().includes(lowered)
            );
        }

        if (member?.user) return member.user;
    }

    return null;
}

module.exports = {
    name: 'purgeuser',
    description: 'Delete recent messages from a specific user',
    category: 'mod',
    usage: 'purgeuser <@user|userID|username|display name> <amount>',
    aliases: ['user-purge', 'purge-user'],
    async execute(client, message, args) {
        // Guard against DMs
        if (!message.guild) return;

        // Permission check: Administrator OR Bot Owner OR Server Owner
        const app = client.application?.partial
            ? await client.application.fetch()
            : client.application;

        const ownerId =
            app.owner?.id ||
            app.owner?.ownerUserId ||
            null;

        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
        const isBotOwner = message.author.id === ownerId;
        const isServerOwner = message.author.id === message.guild.ownerId;

        if (!isAdmin && !isBotOwner && !isServerOwner) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription('You need Administrator permission, be the bot owner, or be the server owner to use this command.')
                ]
            });
        }

        // Check bot permissions
        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription('I need the Manage Messages permission to purge messages.')
                ]
            });
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription('I need the Read Message History permission to fetch messages.')
                ]
            });
        }

        // If no arguments, show usage instructions
        if (args.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ec4899')
                .setTitle('Purge User Command')
                .setDescription('Delete recent messages from a specific user.')
                .addFields(
                    { name: 'Usage', value: '`purgeuser <@user|userID|username|display name> <amount>`\n`user-purge <@user|userID|username|display name> <amount>`', inline: false },
                    { name: 'Examples', value: '`purgeuser @Alice 50`\n`purgeuser 123456789012345678 100`\n`purgeuser Alice 200`\n`purgeuser "Alice Smith" 30`', inline: false },
                    { name: 'Notes', value: '• Deletes the most recent messages from the user first\n• Maximum 500 messages\n• Only works on messages from the last 14 days\n• Requires Administrator, Bot Owner, or Server Owner', inline: false }
                )
                .setFooter({ text: 'Use with caution - this cannot be undone!' });

            return message.reply({ embeds: [embed] });
        }

        // Amount is always the last argument
        const amountArg = args[args.length - 1];
        const amount = Number(amountArg);
        if (!Number.isInteger(amount) || amount < 1 || amount > 500) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription('Please provide a valid whole number between 1-500.\n\n**Usage:** `purgeuser <@user|userID|username|display name> <amount>`')
                ]
            });
        }

        // Target is everything except the last argument (supports multi-word names)
        const targetArg = args.slice(0, -1).join(' ');
        const target = await resolveTargetUser(client, message, targetArg);

        if (!target) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription('Could not find that user. Use a mention, user ID, username, or display name.')
                ]
            });
        }

        // Delete the command message first
        await message.delete().catch(() => {});

        try {
            const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            let allUserMessages = [];
            let lastId = null;

            // Always fetch 100 at a time, keep going until we have enough or hit limits
            while (allUserMessages.length < amount) {
                const fetched = await message.channel.messages.fetch({
                    limit: 100,
                    ...(lastId ? { before: lastId } : {}),
                });

                if (!fetched.size) break;

                // Filter messages from target user within 14 days
                const userMessages = fetched.filter(m =>
                    m.author.id === target.id &&
                    m.createdTimestamp > twoWeeksAgo
                );

                // Add only unique messages (avoid duplicates)
                for (const msg of userMessages.values()) {
                    if (!allUserMessages.some(m => m.id === msg.id)) {
                        allUserMessages.push(msg);
                    }
                }

                lastId = fetched.last().id;

                // Stop if the oldest message in this batch is older than 14 days
                if (fetched.last().createdTimestamp < twoWeeksAgo) break;
                // Stop if we got less than 100 messages (reached start of channel)
                if (fetched.size < 100) break;
            }

            if (allUserMessages.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setDescription(`No messages found from ${target.tag} in the last 14 days.`);

                const reply = await message.channel.send({ embeds: [embed] });
                setTimeout(() => reply.delete().catch(() => {}), 5000);
                return;
            }

            // Sort by timestamp (newest first) and limit to requested amount
            allUserMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            const toDelete = allUserMessages.slice(0, amount);

            // Bulk delete in chunks of 100
            let deletedCount = 0;
            const chunks = [];
            for (let i = 0; i < toDelete.length; i += 100) {
                chunks.push(toDelete.slice(i, i + 100));
            }

            for (const chunk of chunks) {
                const deleted = await message.channel.bulkDelete(
                    chunk.map(msg => msg.id),
                    true
                );
                deletedCount += deleted.size;
            }

            // Send success message
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setDescription(`Successfully deleted **${deletedCount}** message${deletedCount === 1 ? '' : 's'} from ${target.tag}`)
                .setFooter({ text: `Deleted by ${message.author.tag}` });

            const reply = await message.channel.send({ embeds: [embed] });
            setTimeout(() => reply.delete().catch(() => {}), 5000);

        } catch (error) {
            console.error('[Purge User] Error:', error);

            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`Failed to purge messages: ${error.message}`);

            const reply = await message.channel.send({ embeds: [embed] });
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        }
    }
};