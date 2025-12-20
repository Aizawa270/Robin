const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'userbanner',
  aliases: ['ub'], // ✅ alias
  description: "Shows a user's banner.",
  category: 'info',
  usage: '$userbanner [@user]',
  async execute(client, message, args) {
    const user =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null)) ||
      message.author;

    // 🔥 force fetch to get banner
    const fetchedUser = await client.users.fetch(user.id, { force: true });

    if (!fetchedUser.banner) {
      return message.reply('❌ This user does not have a banner.');
    }

    const bannerUrl = fetchedUser.bannerURL({
      size: 2048,
      extension: 'png',
      forceStatic: false
    });

    const embed = new EmbedBuilder()
      .setColor(colors.avatar)
      .setTitle('User Banner')
      .setDescription(`${user}`)
      .setImage(bannerUrl)
      .setFooter({ text: `${user.tag}` });

    await message.reply({ embeds: [embed] });
  },
};