const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'avatar',
  description: "Shows a user's avatar.",
  category: 'info',
  usage: '$avatar [@user]',
  async execute(client, message, args) {
    const user =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null)) ||
      message.author;

    const avatarUrl = user.displayAvatarURL({ size: 2048, extension: 'png', forceStatic: false });

    const embed = new EmbedBuilder()
      .setColor(colors.avatar)
      .setTitle('User Avatar')
      .setDescription(`${user}`)
      .setImage(avatarUrl)
      .setFooter({ text: `${user.tag}` });

    await message.reply({ embeds: [embed] });
  },
};