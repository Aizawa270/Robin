const { EmbedBuilder, ChannelType } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'channelinfo',
  description: 'Shows info about the current channel or a specified channel ID.',
  category: 'info',
  usage: '$channelinfo [channelID]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    let channel = message.channel;
    if (args[0]) {
      const found = message.guild.channels.cache.get(args[0]);
      if (found) channel = found;
    }

    const typeLabel = {
      [ChannelType.GuildText]: 'Text Channel',
      [ChannelType.GuildVoice]: 'Voice Channel',
      [ChannelType.GuildCategory]: 'Category',
      [ChannelType.GuildAnnouncement]: 'Announcement Channel',
      [ChannelType.PublicThread]: 'Public Thread',
      [ChannelType.PrivateThread]: 'Private Thread',
      [ChannelType.AnnouncementThread]: 'Announcement Thread',
      [ChannelType.GuildStageVoice]: 'Stage Channel',
      [ChannelType.GuildForum]: 'Forum Channel',
    }[channel.type] || 'Unknown';

    const createdAt = `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>`;

    const topic =
      'topic' in channel && channel.topic
        ? channel.topic
        : 'No topic set';

    const embed = new EmbedBuilder()
      .setColor(colors.channelinfo)
      .setTitle(`#${channel.name}`)
      .addFields(
        { name: 'Channel ID', value: channel.id, inline: true },
        { name: 'Type', value: typeLabel, inline: true },
        { name: 'Created At', value: createdAt, inline: false },
        { name: 'Topic', value: topic, inline: false },
      );

    await message.reply({ embeds: [embed] });
  },
};