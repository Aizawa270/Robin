const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

module.exports = {
  name: 'uptime',
  description: 'Shows how long the bot has been online.',
  category: 'utility',
  usage: '$uptime',
  async execute(client, message) {
    const uptimeMs = client.uptime ?? 0;
    const formatted = formatDuration(uptimeMs);

    const embed = new EmbedBuilder()
      .setColor(colors.uptime)
      .setTitle('Uptime')
      .setDescription(`I have been online for **${formatted}**.`);

    await message.reply({ embeds: [embed] });
  },
};