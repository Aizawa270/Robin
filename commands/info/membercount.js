const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'membercount',
  aliases: ['mc'],
  description: 'Shows total server members.',
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

      const embed = new EmbedBuilder()
        .setColor(colors?.membercount || '#00ff88')
        .setTitle('Member Count')
        .setDescription(`**Total Members:** \`${totalMembers.toLocaleString()}\``)
        .setThumbnail(guild.iconURL({ size: 1024, dynamic: true }))
        .setFooter({ 
          text: `Used by ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL({ size: 64 })
        })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Membercount error:', error);

      // Fallback using cached data
      const cachedTotal = guild.members.cache.size;

      const fallbackEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('Member Count (Approximate)')
        .setDescription(`**Total Members:** \`${cachedTotal.toLocaleString()}\``)
        .setThumbnail(guild.iconURL({ size: 1024, dynamic: true }))
        .setFooter({ 
          text: `Used by ${message.author.tag} • Cached data`,
          iconURL: message.author.displayAvatarURL({ size: 64 })
        })
        .setTimestamp();

      await message.reply({ embeds: [fallbackEmbed] });
    }
  },
};