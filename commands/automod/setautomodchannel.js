const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'setautomodchannel',
  aliases: ['saal'],
  description: 'Set the channel where automod alerts are posted.',
  category: 'automod',
  hidden: true,
  usage: '$setautomodchannel #channel',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Admins only.');
    }

    const channel = message.mentions.channels.first() || 
                   (args[0] && message.guild.channels.cache.get(args[0]));
    if (!channel) return message.reply('Mention a channel or pass its ID.');

    // Check if automod system is initialized
    if (!client.automod || typeof client.automod.setAutomodChannel !== 'function') {
      return message.reply('Automod system not initialized. Please restart the bot.');
    }

    try {
      // Save to database
      const success = client.automod.setAutomodChannel(message.guild.id, channel.id);
      
      if (!success) {
        return message.reply('Failed to save automod channel. Database might be unavailable.');
      }

      console.log(`[Automod] Alert channel set to ${channel.id} for guild ${message.guild.id}`);

      // FIXED: Use EmbedBuilder directly instead of message.createEmbed()
      const embed = new EmbedBuilder()
        .setTitle('✅ Automod Alert Channel Set')
        .setDescription(`Automod alerts will be posted to ${channel}`)
        .setColor('#22c55e')
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error setting automod channel:', error);
      await message.reply('Failed to set automod channel. Check bot logs.');
    }
  },
};