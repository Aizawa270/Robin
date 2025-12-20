const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'membercount',
  aliases: ['mc'], // ✅ added alias
  description: 'Shows total server members, humans and bots.',
  category: 'info',
  usage: '$membercount',
  async execute(client, message) {
    const guild = message.guild;
    if (!guild) {
      return message.reply('This command can only be used in a server.');
    }

    const members = guild.members.cache;
    const bots = members.filter((m) => m.user.bot).size;
    const humans = members.size - bots;

    const embed = new EmbedBuilder()
      .setColor(colors.membercount)
      .setTitle('Member Count')
      .setThumbnail(guild.iconURL({ size: 1024 }))
      .addFields(
        { name: 'Total Members', value: `${members.size}`, inline: true },
        { name: 'Humans', value: `${humans}`, inline: true },
        { name: 'Bots', value: `${bots}`, inline: true },
      );

    await message.reply({ embeds: [embed] });
  },
};