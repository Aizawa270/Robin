const { EmbedBuilder, ChannelType } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'serverinfo',
  description: 'Shows detailed information about this server.',
  category: 'info',
  usage: '$serverinfo',

  async execute(client, message) {
    const guild = message.guild;
    if (!guild) return message.reply('This command only works in servers.');

    // 🔥 Fetch fresh data (no cache lies)
    await guild.members.fetch().catch(() => {});
    await guild.channels.fetch().catch(() => {});

    const owner = await guild.fetchOwner().catch(() => null);

    const members = guild.members.cache;
    const bots = members.filter(m => m.user.bot).size;
    const humans = members.size - bots;

    const channels = guild.channels.cache;
    const textChannels = channels.filter(c =>
      c.type === ChannelType.GuildText ||
      c.type === ChannelType.GuildAnnouncement
    ).size;

    const voiceChannels = channels.filter(c =>
      c.type === ChannelType.GuildVoice ||
      c.type === ChannelType.GuildStageVoice
    ).size;

    const rolesCount = guild.roles.cache.size - 1; // exclude @everyone
    const emojiCount = guild.emojis.cache.size;

    const embed = new EmbedBuilder()
      .setColor(colors.serverinfo || '#5865F2')
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 }))
      .addFields(
        { name: 'Server ID', value: guild.id, inline: true },
        { name: 'Owner', value: owner ? owner.user.tag : 'Unknown', inline: true },
        {
          name: '👥 Members',
          value:
            `Total: **${members.size}**\n` +
            `Humans: **${humans}**\n` +
            `Bots: **${bots}**`,
          inline: false,
        },
        {
          name: 'Channels',
          value:
            `Text: **${textChannels}**\n` +
            `Voice: **${voiceChannels}**\n` +
            `Total: **${channels.size}**`,
          inline: false,
        },
        {
          name: 'Server Stats',
          value:
            `Roles: **${rolesCount}**\n` +
            `Emojis: **${emojiCount}**`,
          inline: false,
        },
        {
          name: 'Boosts',
          value: `Level **${guild.premiumTier}** (${guild.premiumSubscriptionCount || 0} boosts)`,
          inline: false,
        },
        {
          name: 'Created On',
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
          inline: false,
        },
      );

    return message.reply({ embeds: [embed] });
  },
};