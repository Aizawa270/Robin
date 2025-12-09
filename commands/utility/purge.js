const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'purge',
  description: 'Deletes a number of recent messages in this channel (up to 100).',
  category: 'utility',
  usage: '$purge <amount>',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Only admins can use
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Only admins can use this command.');
    }

    // Bot permission
    if (!message.guild.members.me.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('I need the **Manage Messages** permission in this channel to purge messages.');
    }

    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount <= 0) {
      return message.reply('Please provide a valid number of messages to delete. Example: `$purge 20`');
    }

    if (amount > 100) {
      return message.reply('I can only delete up to **100** messages at a time.');
    }

    const deleteCount = amount + 1; // include the command message

    try {
      const deleted = await message.channel.bulkDelete(deleteCount, true);

      const confirmation = await message.channel.send(`Deleted **${deleted.size - 1}** messages.`);
      setTimeout(() => {
        confirmation.delete().catch(() => {});
      }, 3000);
    } catch (err) {
      console.error('Purge command error:', err);
      return message.reply('I could not delete messages here. Messages older than 14 days cannot be deleted.');
    }
  },
};