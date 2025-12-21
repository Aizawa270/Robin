const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'purge',
  description: 'Deletes messages (up to 300).',
  category: 'utility',
  usage: '$purge <amount>',
  async execute(client, message, args) {
    // ✅ DYNAMIC PREFIX
    const prefix = message.prefix || client.getPrefix(message.guild?.id) || '!';

    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // ✅ EMBED FOR NON-ADMINS
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      const embed = new EmbedBuilder()
        .setColor('#ef4444') // Red color
        .setTitle('Permission Denied')
        .setDescription(`**${message.author.tag}**, you don't have permission to use this command.`)
        .addFields(
          { name: 'Required Permission', value: '`Administrator`', inline: true },
          { name: 'Your Role', value: message.member.roles.highest.name || 'No role', inline: true }
        )
        .setThumbnail(message.author.displayAvatarURL({ size: 64 }))
        .setFooter({ text: 'Admin-only command' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // Bot permission check
    if (!message.guild.members.me.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('I need **Manage Messages** permission.');
    }

    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount <= 0) {
      return message.reply(`Please provide a valid number. Example: \`${prefix}purge 20\``);
    }

    if (amount > 300) {
      return message.reply(`I can only delete up to **300** messages. Use \`${prefix}purge 300\` or less.`);
    }

    try {
      // Fetch messages (add 1 to include the command message)
      const messagesToDelete = amount + 1;
      
      // Bulk delete messages
      const deletedMessages = await message.channel.bulkDelete(messagesToDelete, true);
      
      // Get actual count (bulkDelete returns a Collection)
      const deletedCount = deletedMessages.size - 1; // Subtract the command message
      
      // Send confirmation
      const confirmation = await message.channel.send(`✅ Deleted **${deletedCount}** messages.`);
      
      // Delete confirmation after 3 seconds
      setTimeout(() => {
        confirmation.delete().catch(() => {});
      }, 3000);
      
    } catch (error) {
      console.error('Purge command error:', error);
      
      if (error.code === 50034) {
        // Discord API error: Cannot bulk delete messages older than 14 days
        return message.reply('Cannot delete messages older than 14 days. Try a smaller amount or delete manually.');
      }
      
      // Try alternative method for older messages
      try {
        let deletedCount = 0;
        const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        
        // Fetch messages
        const fetchedMessages = await message.channel.messages.fetch({ limit: Math.min(amount, 100) });
        
        // Filter messages newer than 14 days
        const messagesToDelete = fetchedMessages.filter(msg => 
          msg.createdTimestamp > twoWeeksAgo && msg.deletable
        );
        
        // Delete messages one by one (slower but works for older messages)
        for (const msg of messagesToDelete.values()) {
          await msg.delete().catch(() => {});
          deletedCount++;
        }
        
        const confirmation = await message.channel.send(`✅ Deleted **${deletedCount}** messages (some messages were too old to bulk delete).`);
        
        setTimeout(() => {
          confirmation.delete().catch(() => {});
        }, 3000);
        
      } catch (secondError) {
        console.error('Alternative purge error:', secondError);
        return message.reply('Failed to delete messages. Check console for errors.');
      }
    }
  },
};