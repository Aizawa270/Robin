const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'userbannerserver',
  aliases: ['ubs'],
  description: "Shows a user's server-specific banner.",
  category: 'info',
  usage: '$userbannerserver [@user]',
  async execute(client, message, args) {
    if (!message.guild) return;

    const member =
      message.mentions.members.first() ||
      (args[0] && await message.guild.members.fetch(args[0]).catch(() => null)) ||
      message.member;

    if (!member) return message.reply('❌ User not found in this server.');

    const serverBannerUrl = member.bannerURL?.({ size: 2048, extension: 'png', forceStatic: false });

    if (!serverBannerUrl) return message.reply('❌ This user does not have a server banner.');

    const embed = new EmbedBuilder()
      .setColor(colors.avatar)
      .setTitle('Server Banner')
      .setDescription(`${member.user}`)
      .setImage(serverBannerUrl)
      .setFooter({ text: `${member.user.tag}` });

    await message.reply({ embeds: [embed] });
  },
};