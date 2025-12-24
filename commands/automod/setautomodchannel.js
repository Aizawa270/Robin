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
    
    if (!channel) {
      return message.reply('Mention a channel or provide a channel ID.');
    }

    // Check if automod system is initialized
    if (!client.automod || typeof client.automod.setAutomodChannel !== 'function') {
      return message.reply('Automod system not initialized. Please restart the bot.');
    }

    try {
      console.log(`[Automod] Setting alert channel to ${channel.id} for guild ${message.guild.id}`);
      
      // Save to database
      const success = client.automod.setAutomodChannel(message.guild.id, channel.id);

      if (!success) {
        return message.reply('Failed to save automod channel to database.');
      }

      // Verify the channel was saved
      setTimeout(() => {
        try {
          const savedChannelId = client.automod.getAutomodChannel(message.guild.id);
          console.log(`[Automod] Verification: Channel ${savedChannelId ? 'WAS' : 'WAS NOT'} saved to database`);
        } catch (verifyError) {
          console.error('[Automod] Verification error:', verifyError);
        }
      }, 500);

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('✅ Automod Alert Channel Set')
        .setDescription(`Automod alerts will be posted to ${channel}`)
        .addFields(
          { name: 'Channel', value: `${channel}`, inline: true },
          { name: 'Channel ID', value: `\`${channel.id}\``, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Set by ${message.author.tag}` });

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error setting automod channel:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('❌ Failed to Set Automod Channel')
        .setDescription('There was an error setting the automod alert channel.')
        .addFields(
          { name: 'Error', value: error.message.substring(0, 100), inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [errorEmbed] });
    }
  },
};