const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const AUTHORIZED_ROLES = [
  '1432015058959073291', // admins invis
  '1432015105045954651', // manager invis
  '1431651904269848667'  // director
];

const MAX_PURGE = 1000;

module.exports = {
  name: 'purge',
  description: 'Instantly deletes messages (up to 1000).',
  category: 'utility',
  usage: '$purge <amount>',

  async execute(client, message, args) {
    const prefix = message.prefix || client.getPrefix(message.guild?.id) || '!';

    if (!message.guild) return;

    // Check if user has Administrator OR one of the authorized roles
    const hasAuthorizedRole = AUTHORIZED_ROLES.some(roleId => 
      message.member.roles.cache.has(roleId)
    );

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !hasAuthorizedRole) {
      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Permission Denied')
        .setDescription(`You do not have permission to use this command.`);

      return message.reply({ embeds: [embed] });
    }

    // Bot perms
    if (!message.guild.members.me.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('I need **Manage Messages** permission.');
    }

    // Validate args
    if (!args[0]) {
      return message.reply(`Usage: \`${prefix}purge <1-${MAX_PURGE}>\``);
    }

    // Parse amount with strict validation
    const amount = parseInt(args[0], 10);

    // Check if it's a valid number
    if (isNaN(amount) || !Number.isInteger(amount)) {
      return message.reply(`❌ **${args[0]}** is not a valid number. Usage: \`${prefix}purge <1-${MAX_PURGE}>\``);
    }

    // Check range
    if (amount <= 0) {
      return message.reply(`❌ Amount must be at least **1**. Usage: \`${prefix}purge <1-${MAX_PURGE}>\``);
    }

    if (amount > MAX_PURGE) {
      return message.reply(`❌ Max purge limit is **${MAX_PURGE}** messages.`);
    }

    try {
      // Delete command message first
      if (message.deletable) await message.delete().catch(() => {});

      let remaining = amount;
      let totalDeleted = 0;
      let oldMessageCount = 0;

      while (remaining > 0) {
        const fetchLimit = Math.min(remaining, 100);

        try {
          const messages = await message.channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
          
          if (!messages || !messages.size) break;

          const deleted = await message.channel.bulkDelete(messages, true).catch((err) => {
            console.error('Bulk delete error:', err);
            return new Map(); // Return empty map on error
          });

          totalDeleted += deleted.size;
          remaining -= deleted.size;

          // Stop if Discord refuses (old messages or other issue)
          if (deleted.size < fetchLimit) {
            oldMessageCount = remaining;
            break;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (fetchErr) {
          console.error('Message fetch error:', fetchErr);
          break;
        }
      }

      // Build response message
      let responseText = `🧹 Deleted **${totalDeleted}** message${totalDeleted !== 1 ? 's' : ''}`;
      
      if (oldMessageCount > 0) {
        responseText += `\n⚠️ Skipped **${oldMessageCount}** message${oldMessageCount !== 1 ? 's' : ''}` +
                       ` (older than 14 days)`;
      }

      const confirm = await message.channel.send(responseText);

      setTimeout(() => confirm.delete().catch(() => {}), 3000);

    } catch (err) {
      console.error('Purge error:', err);

      // Handle specific error codes
      if (err.code === 50034) {
        return message.channel.send(
          '❌ Some messages are older than **14 days** and cannot be deleted.'
        );
      }

      if (err.code === 50013) {
        return message.channel.send(
          '❌ I lack permission to delete messages in this channel.'
        );
      }

      if (err.message?.includes('bulk delete')) {
        return message.channel.send(
          '❌ Bulk delete failed. Try deleting fewer messages at once.'
        );
      }

      return message.channel.send('❌ Failed to purge messages. Check bot permissions.');
    }
  },
};
