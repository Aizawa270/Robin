const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'serverinfo',
  description: 'Shows information about this server.',
  category: 'info',
  usage: '$serverinfo',
  async execute(client, message) {
    const guild = message.guild;
    if (!guild) {
      return message.reply('This command can only be used in a server.');
    }

    const owner = await guild.fetchOwner().catch(() => null);
    const members = guild.members.cache;
    const bots = members.filter((m) => m.user.bot).size;
    const humans = members.size - bots;

    const channels = guild.channels.cache;
    const textChannels = channels.filter((c) => c.isTextBased() && c.type !== 1).size;
    const voiceChannels = channels.filter((c) => c.type === 2).size;

    const embed = new EmbedBuilder()
      .setColor(colors.serverinfo)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 1024 }))
      .addFields(
        { name: 'Server ID', value: guild.id, inline: true },
        { name: 'Owner', value: owner ? owner.user.tag : 'Unknown', inline: true },
        {
          name: 'Members',
          value: `Total: **${members.size}**\nHumans: **${humans}**\nBots: **${bots}**`,
          inline: false,
        },
        {
          name: 'Channels',
          value: `Text: **${textChannels}**\nVoice: **${voiceChannels}**\nTotal: **${channels.size}**`,
          inline: false,
        },
        {
          name: 'Boost Level',
          value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)`,
          inline: false,
        },
        {
          name: 'Created At',
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
          inline: false,
        },
      );

    await message.reply({ embeds: [embed] });
  },
};