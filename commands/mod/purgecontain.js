const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'purgecontain',
    description: 'Delete messages containing a specific word',
    category: 'mod',
    usage: 'purgecontain <word> <amount>',
    aliases: ['contain-purge', 'purge-contain'],
    async execute(client, message, args) {
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

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription('I need the Manage Messages permission to purge messages.')
                ]
            });
        }

        // If no arguments, show usage instructions
        if (args.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#ec4899')
                .setTitle('Purge Contain Command')
                .setDescription('Delete messages containing a specific word.')
                .addFields(
                    { name: 'Usage', value: '`purgecontain <word> <amount>`\n`contain-purge <word> <amount>`', inline: false },
                    { name: 'Examples', value: '`purgecontain apple 5`\n`contain-purge kiss 200`', inline: false },
                    { name: 'Notes', value: '• Deletes the most recent messages first\n• Maximum 200 messages\n• Only works on messages from the last 14 days\n• Requires Administrator, Bot Owner, or Server Owner', inline: false }
                )
                .setFooter({ text: 'Use with caution - this cannot be undone!' });

            return message.reply({ embeds: [embed] });
        }

        const word = args[0]?.toLowerCase();
        const amount = parseInt(args[1]);

        // Validate inputs
        if (!word) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription('Please provide a word to search for.\n\n**Usage:** `purgecontain <word> <amount>`')
                ]
            });
        }

        if (!amount || amount < 1 || amount > 200) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription('Please provide a valid amount between 1-200.\n\n**Usage:** `purgecontain <word> <amount>`')
                ]
            });
        }

        // Delete the command message first
        await message.delete().catch(() => {});

        try {
            const wordRegex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
            const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

            let allMatchingMessages = [];
            let lastMessageId = null;

            // Keep fetching messages until we have enough matches, run out of messages, or hit 14-day limit
            while (allMatchingMessages.length < amount) {
                const fetchOptions = { limit: 100 };
                if (lastMessageId) {
                    fetchOptions.before = lastMessageId;
                }

                const messages = await message.channel.messages.fetch(fetchOptions);
                if (messages.size === 0) break;

                // Filter messages that contain the word AND are within 14 days
                const matches = messages.filter(msg => {
                    if (!msg.content) return false;
                    const within14Days = msg.createdTimestamp > twoWeeksAgo;
                    return within14Days && wordRegex.test(msg.content);
                });

                allMatchingMessages.push(...matches.values());
                lastMessageId = messages.last().id;

                // Stop if we've gone past 14 days
                if (messages.last().createdTimestamp < twoWeeksAgo) break;
                // Stop if we got less than 100 messages (reached the beginning of the channel within 14 days)
                if (messages.size < 100) break;
            }

            if (allMatchingMessages.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setDescription(`No messages found containing the word "${word}" from the last 14 days.`);

                const reply = await message.channel.send({ embeds: [embed] });
                setTimeout(() => reply.delete().catch(() => {}), 5000);
                return;
            }

            // Sort by timestamp (newest first) and limit to requested amount
            allMatchingMessages.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
            const toDelete = allMatchingMessages.slice(0, amount);

            // Bulk delete (they're all within 14 days, so bulkDelete works)
            let deletedCount = 0;
            const chunks = chunkArray(toDelete, 100);
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
                .setDescription(`Successfully deleted **${deletedCount}** message${deletedCount === 1 ? '' : 's'} containing "${word}"`)
                .setFooter({ text: `Deleted by ${message.author.tag}` });

            const reply = await message.channel.send({ embeds: [embed] });
            setTimeout(() => reply.delete().catch(() => {}), 5000);

        } catch (error) {
            console.error('[Purge Contain] Error:', error);

            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`Failed to purge messages: ${error.message}`);

            const reply = await message.channel.send({ embeds: [embed] });
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        }
    }
};

// Helper function to escape regex special characters
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to chunk array
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}