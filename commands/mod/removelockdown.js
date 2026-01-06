const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'removelockdown',
  description: 'Removes lockdown from a channel.',
  category: 'mod',
  usage: '!removelockdown [#channel | channelID]',

  async execute(client, message, args) {
    // Admin only
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Admins only.');
    }

    // Get channel
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[0]) ||
      message.channel;

    if (!channel) {
      return message.reply('❌ Invalid channel.');
    }

    try {
      // Restore send messages for everyone
      await channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: null,
          AddReactions: null,
          CreatePublicThreads: null,
          CreatePrivateThreads: null,
        }
      );

      message.reply(`🔓 **Lockdown removed** in ${channel}.`);
    } catch (err) {
      console.error('RemoveLockdown error:', err);
      message.reply('❌ Failed to remove lockdown.');
    }
  },
};