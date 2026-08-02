const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');
const { resolveMember: universalResolveMember } = require('../../handlers/universalHelper');

module.exports = {
  name: 'userbannerserver',
  aliases: ['ubs'],
  description: "Shows a user's server-specific banner.",
  category: 'info',
  usage: '$userbannerserver [@user]',

  async execute(client, message, args) {
    if (!message.guild) return;

    let member = null;

    if (args[0]) {
      if (typeof message.resolveMember === 'function') {
        member = await message.resolveMember(args[0]).catch(() => null);
      }

      if (!member && typeof universalResolveMember === 'function') {
        member = await universalResolveMember(client, message, args[0]).catch(() => null);
      }

      if (!member && message.mentions.members.first()) {
        member = message.mentions.members.first();
      }
    } else {
      member = message.member;
    }

    if (!member) return message.reply('❌ User not found in this server.');

    const serverBannerUrl = member.bannerURL?.({
      size: 2048,
      extension: 'png',
      forceStatic: false
    });

    if (!serverBannerUrl) return message.reply('❌ This user does not have a server banner.');

    const embed = new EmbedBuilder()
      .setColor(colors.avatar || '#5865F2')
      .setTitle('Server Banner')
      .setDescription(`${member.user}`)
      .setImage(serverBannerUrl)
      .setFooter({ text: `${member.user.tag || member.user.username}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};