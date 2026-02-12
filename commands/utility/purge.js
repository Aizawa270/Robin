const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const AUTHORIZED_ROLES = [
  '1432015058959073291', // admins invis
  '1432015105045954651', // manager invis
  '1431651904269848667'  // director
];

module.exports = {
  name: 'purge',
  description: 'Instantly deletes messages (up to 500).',
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

    const amount = parseInt(args[0], 10);
    if (!amount || amount <= 0) {
      return message.reply(`Usage: \`${prefix}purge <1-500>\``);
    }

    if (amount > 500) {
      return message.reply('Max purge limit is **500** messages.');
    }

    try {
      // Delete command message first
      if (message.deletable) await message.delete().catch(() => {});

      let remaining = amount;
      let totalDeleted = 0;

      while (remaining > 0) {
        const fetchLimit = Math.min(remaining, 100);

        const messages = await message.channel.messages.fetch({ limit: fetchLimit });
        if (!messages.size) break;

        const deleted = await message.channel.bulkDelete(messages, true);
        totalDeleted += deleted.size;
        remaining -= deleted.size;

        // Stop if Discord refuses (old messages)
        if (deleted.size < fetchLimit) break;
      }

      const confirm = await message.channel.send(
        `🧹 Deleted **${totalDeleted}** messages.`
      );

      setTimeout(() => confirm.delete().catch(() => {}), 2500);

    } catch (err) {
      console.error('Purge error:', err);

      if (err.code === 50034) {
        return message.channel.send(
          'Some messages are older than **14 days** and cannot be deleted.'
        );
      }

      return message.channel.send('Failed to purge messages.');
    }
  },
};