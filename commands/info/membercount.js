const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'membercount',
  aliases: ['mc'],
  description: 'Shows total server members, humans and bots.',
  category: 'info',
  usage: '$membercount',
  async execute(client, message) {
    const guild = message.guild;
    if (!guild) {
      return message.reply('This command can only be used in a server.');
    }

    try {
      // Fetch all members to ensure accurate count
      await guild.members.fetch();
      
      const totalMembers = guild.memberCount;
      const bots = guild.members.cache.filter(m => m.user.bot).size;
      const humans = totalMembers - bots;

      const embed = new EmbedBuilder()
        .setColor(colors?.membercount || '#00ff88')
        .setTitle('Member Count')
        .setThumbnail(guild.iconURL({ size: 1024 }))
        .addFields(
          { name: 'Total Members', value: `${totalMembers.toLocaleString()}`, inline: true },
          { name: 'Humans', value: `${humans.toLocaleString()}`, inline: true },
          { name: 'Bots', value: `${bots.toLocaleString()}`, inline: true }
        )
        .setFooter({ text: `Server: ${guild.name}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Membercount error:', error);
      
      // Fallback if fetch fails - use cached data
      const cachedMembers = guild.members.cache;
      const cachedTotal = cachedMembers.size;
      const cachedBots = cachedMembers.filter(m => m.user.bot).size;
      const cachedHumans = cachedTotal - cachedBots;

      const fallbackEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('Member Count (Approximate)')
        .setDescription('*Using cached data - may be incomplete*')
        .addFields(
          { name: 'Total Members', value: `${cachedTotal.toLocaleString()}`, inline: true },
          { name: 'Humans', value: `${cachedHumans.toLocaleString()}`, inline: true },
          { name: 'Bots', value: `${cachedBots.toLocaleString()}`, inline: true }
        )
        .setFooter({ text: 'Note: Count may be inaccurate due to caching' });

      await message.reply({ embeds: [fallbackEmbed] });
    }
  },
};