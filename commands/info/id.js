const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'id',
  description: 'Shows user ID and username.',
  category: 'info',
  usage: '$id [@user]',
  async execute(client, message, args) {
    const user =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null)) ||
      message.author;

    const embed = new EmbedBuilder()
      .setColor(colors.id)
      .setTitle('User ID Information')
      .setThumbnail(user.displayAvatarURL({ size: 1024 }))
      .addFields(
        { name: 'User', value: `${user} (${user.tag})`, inline: false },
        { name: 'User ID', value: user.id, inline: false },
      );

    await message.reply({ embeds: [embed] });
  },
};