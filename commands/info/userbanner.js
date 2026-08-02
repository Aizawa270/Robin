const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');
const { resolveUser: universalResolveUser } = require('../../handlers/universalHelper');

module.exports = {
  name: 'userbanner',
  aliases: ['ub'],
  description: "Shows a user's banner.",
  category: 'info',
  usage: '$userbanner [@user]',

  async execute(client, message, args) {
    let user = null;

    if (args[0]) {
      if (typeof message.resolveUser === 'function') {
        user = await message.resolveUser(args[0]).catch(() => null);
      }

      if (!user && typeof universalResolveUser === 'function') {
        user = await universalResolveUser(client, message, args[0]).catch(() => null);
      }

      if (!user && message.mentions.users.first()) {
        user = message.mentions.users.first();
      }
    }

    if (!user) {
      user = message.author;
    }

    const fetchedUser = await client.users.fetch(user.id, { force: true }).catch(() => user);
    const bannerUrl = fetchedUser.bannerURL?.({
      size: 2048,
      extension: 'png',
      forceStatic: false
    });

    if (!bannerUrl) {
      return message.reply('❌ This user does not have a banner.');
    }

    const embed = new EmbedBuilder()
      .setColor(colors.avatar || '#5865F2')
      .setTitle('User Banner')
      .setDescription(`${user}`)
      .setImage(bannerUrl)
      .setFooter({ text: `${user.tag || user.username}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};