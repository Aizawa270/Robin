const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');
const os = require('os');

module.exports = {
  name: 'botinfo',
  description: 'Shows information about the bot.',
  category: 'utility',
  usage: '$botinfo',
  async execute(client, message) {
    const uptimeMs = client.uptime ?? 0;
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const uptimeString = `${days}d ${hours}h ${minutes}m`;

    const memoryUsage = process.memoryUsage();
    const usedMB = (memoryUsage.rss / 1024 / 1024).toFixed(2);

    const commandsLoaded = client.commands?.size ?? 0;

    const embed = new EmbedBuilder()
      .setColor(colors.botinfo)
      .setTitle('Bot Information')
      .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
      .addFields(
        { name: 'Tag', value: client.user.tag, inline: true },
        { name: 'ID', value: client.user.id, inline: true },
        { name: 'Uptime', value: uptimeString, inline: true },
        { name: 'Commands Loaded', value: `${commandsLoaded}`, inline: true },
        { name: 'Developer', value: 'Astrix', inline: true },
        { name: 'Memory Usage', value: `${usedMB} MB`, inline: true },
        { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Node.js', value: process.version, inline: true },
        { name: 'Platform', value: `${os.platform()} ${os.arch()}`, inline: true },
      );

    await message.reply({ embeds: [embed] });
  },
};
