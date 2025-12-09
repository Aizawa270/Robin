const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'servericon',
  description: 'Shows the server icon.',
  category: 'info',
  usage: '$servericon',
  async execute(client, message) {
    const guild = message.guild;
    if (!guild) {
      return message.reply('This command can only be used in a server.');
    }

    const iconUrl = guild.iconURL({ size: 2048, extension: 'png', forceStatic: false });
    if (!iconUrl) {
      return message.reply('This server has no icon.');
    }

    const embed = new EmbedBuilder()
      .setColor(colors.servericon)
      .setTitle('Server Icon')
      .setImage(iconUrl);

    await message.reply({ embeds: [embed] });
  },
};