const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'avatar',
  aliases: ['av', 'pfp'],
  description: "Shows a user's avatar.",
  category: 'info',
  usage: '$avatar [@user]',
  async execute(client, message, args) {
    const user =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null)) ||
      message.author;

    const avatarUrl = user.displayAvatarURL({
      size: 2048,
      extension: 'png',
      forceStatic: false
    });

    const embed = new EmbedBuilder()
      .setColor(colors.avatar || '#5865F2') // fallback color
      .setTitle('User Avatar')
      .setDescription(`${user}`)
      .setImage(avatarUrl)
      .setFooter({ text: `Requested by ${message.author.tag}` }) // footer shows who requested
      .setTimestamp(); // timestamp at bottom

    await message.reply({ embeds: [embed] });
  },
};