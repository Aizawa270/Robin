const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'contain',
  description: 'Delete messages containing a specific word',
  category: 'mod',
  usage: 'purge contain <word> <amount>',
  aliases: [],
  async execute(client, message, args) {
    // Check permissions
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You need Administrator permission to use this command.');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('I need the Manage Messages permission to purge messages.');
    }

    // If no arguments, show usage instructions
    if (args.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle('Purge Contain Command')
        .setDescription('Delete messages containing a specific word.')
        .addFields(
          {
            name: '📝 Usage',
            value: '`purge contain <word> <amount>`',
            inline: false
          },
          {
            name: '📋 Examples',
            value: '`purge contain jeo 200`\n`purge contain kiss 5`',
            inline: false
          },
          {
            name: '⚠️ Notes',
            value: '• Only matches whole words\n• Maximum 200 messages\n• Messages older than 14 days delete slower\n• Requires Administrator permission',
            inline: false
          }
        )
        .setFooter({ text: 'Use with caution - this cannot be undone!' });

      return message.reply({ embeds: [embed] });
    }

    const word = args[0]?.toLowerCase();
    const amount = parseInt(args[1]);

    // Validate inputs
    if (!word) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription('❌ Please provide a word to search for.\n\n**Usage:** `purge contain <word> <amount>`');
      return message.reply({ embeds: [embed] });
    }

    if (!amount || amount < 1 || amount > 200) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription('❌ Please provide a valid amount between 1-200.\n\n**Usage:** `purge contain <word> <amount>`');
      return message.reply({ embeds: [embed] });
    }

    // Delete the command message first
    await message.delete().catch(() => {});

    try {
      // Fetch messages (fetch more than needed to find enough matches)
      const fetchLimit = Math.min(amount * 10, 1000);
      const messages = await message.channel.messages.fetch({ limit: fetchLimit });

      // Build regex for whole word matching
      const wordRegex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');

      // Filter messages that contain the word as a whole word
      const toDelete = messages.filter(msg => {
        if (!msg.content) return false;
        return wordRegex.test(msg.content);
      });

      // Limit to the requested amount
      const limitedDelete = Array.from(toDelete.values()).slice(0, amount);

      if (limitedDelete.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setDescription(`❌ No messages found containing the word **"${word}"**`);

        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return;
      }

      // Split into messages newer than 14 days and older
      const now = Date.now();
      const twoWeeks = 14 * 24 * 60 * 60 * 1000;

      const bulkDeletable = limitedDelete.filter(msg => (now - msg.createdTimestamp) < twoWeeks);
      const manualDelete = limitedDelete.filter(msg => (now - msg.createdTimestamp) >= twoWeeks);

      let deletedCount = 0;

      // Bulk delete messages newer than 14 days
      if (bulkDeletable.length > 0) {
        const chunks = chunkArray(bulkDeletable, 100);
        for (const chunk of chunks) {
          await message.channel.bulkDelete(chunk, true);
          deletedCount += chunk.length;
        }
      }

      // Manually delete messages older than 14 days
      if (manualDelete.length > 0) {
        for (const msg of manualDelete) {
          try {
            await msg.delete();
            deletedCount++;
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (err) {
            console.error('[Purge Contain] Failed to delete old message:', err);
          }
        }
      }

      // Send success message
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setDescription(`✅ Successfully deleted **${deletedCount}** message${deletedCount === 1 ? '' : 's'} containing **"${word}"**`)
        .setFooter({ text: `Deleted by ${message.author.tag}` });

      const reply = await message.channel.send({ embeds: [embed] });
      setTimeout(() => reply.delete().catch(() => {}), 5000);

    } catch (error) {
      console.error('[Purge Contain] Error:', error);
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setDescription(`❌ Failed to purge messages: ${error.message}`);

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
