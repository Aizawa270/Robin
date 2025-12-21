const { EmbedBuilder, ChannelType } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'channelinfo',
  aliases: ['ci', 'channel'],
  description: 'Shows info about any channel (mention or ID).',
  category: 'info',
  usage: '$channelinfo [#channel|channelID]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    let channel = message.channel;
    
    // Handle channel mentions (#channel) or IDs
    if (args[0]) {
      // Check if it's a channel mention
      const channelMention = args[0].match(/^<#(\d+)>$/);
      const channelId = channelMention ? channelMention[1] : args[0];
      
      // Try to find the channel
      const foundChannel = message.guild.channels.cache.get(channelId);
      
      if (!foundChannel) {
        return message.reply('Channel not found! Use #channel mention or channel ID.');
      }
      
      channel = foundChannel;
    }

    // Channel type mapping
    const typeLabel = {
      [ChannelType.GuildText]: 'Text Channel',
      [ChannelType.GuildVoice]: 'Voice Channel',
      [ChannelType.GuildCategory]: 'Category',
      [ChannelType.GuildAnnouncement]: 'Announcement Channel',
      [ChannelType.GuildStageVoice]: 'Stage Channel',
      [ChannelType.GuildForum]: 'Forum Channel',
      [ChannelType.GuildMedia]: 'Media Channel',
      [ChannelType.PrivateThread]: 'Private Thread',
      [ChannelType.PublicThread]: 'Public Thread',
      [ChannelType.AnnouncementThread]: 'Announcement Thread'
    }[channel.type] || 'Unknown Channel Type';

    // Format creation date
    const createdAt = channel.createdAt 
      ? `<t:${Math.floor(channel.createdAt.getTime() / 1000)}:F> (<t:${Math.floor(channel.createdAt.getTime() / 1000)}:R>)`
      : 'Unknown';

    // Topic/Description
    let topic = 'No topic/description';
    if ('topic' in channel && channel.topic) {
      topic = channel.topic.length > 100 ? channel.topic.substring(0, 100) + '...' : channel.topic;
    } else if ('description' in channel && channel.description) {
      topic = channel.description.length > 100 ? channel.description.substring(0, 100) + '...' : channel.description;
    }

    // Additional info based on channel type
    const additionalFields = [];
    
    // For voice channels
    if (channel.type === ChannelType.GuildVoice) {
      additionalFields.push(
        { name: 'User Limit', value: channel.userLimit === 0 ? 'Unlimited' : channel.userLimit.toString(), inline: true },
        { name: 'Bitrate', value: `${Math.floor(channel.bitrate / 1000)} kbps`, inline: true }
      );
    }
    
    // For text-based channels
    if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(channel.type)) {
      additionalFields.push(
        { name: 'NSFW', value: channel.nsfw ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Slowmode', value: channel.rateLimitPerUser ? `${channel.rateLimitPerUser}s` : 'Off', inline: true }
      );
    }
    
    // Parent category
    if (channel.parent) {
      additionalFields.push(
        { name: 'Category', value: `${channel.parent.name}`, inline: true }
      );
    }

    // Position in list
    additionalFields.push(
      { name: 'Position', value: `#${channel.position + 1}`, inline: true }
    );

    const embed = new EmbedBuilder()
      .setColor(colors.channelinfo || '#5865F2')
      .setTitle(`📊 Channel Info: #${channel.name}`)
      .setDescription(`**Channel:** ${channel}`)
      .addFields(
        { name: 'Channel ID', value: `\`${channel.id}\``, inline: true },
        { name: 'Type', value: typeLabel, inline: true },
        { name: 'Created At', value: createdAt, inline: false }
      );

    // Add topic if exists
    if (topic !== 'No topic/description') {
      embed.addFields({ name: '📋 Topic/Description', value: topic, inline: false });
    }

    // Add additional fields
    if (additionalFields.length > 0) {
      embed.addFields(...additionalFields);
    }

    // Add channel creation timestamp in footer
    embed.setFooter({ 
      text: `Channel created` 
    });

    await message.reply({ embeds: [embed] });
  },
};