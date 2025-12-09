const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'kiss',
  description: 'Send an anime kiss GIF to a user.',
  category: 'fun',
  usage: '$kiss @user',
  async execute(client, message) {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply('Please mention someone to kiss. Example: `$kiss @User`');
    }
    if (target.id === message.author.id) {
      return message.reply('You cannot kiss yourself…');
    }

    try {
      const res = await fetch('https://api.waifu.pics/sfw/kiss');
      const data = await res.json();
      const gifUrl = data.url;

      const embed = new EmbedBuilder()
        .setColor(colors.banner || '#ec4899')
        .setTitle('Kiss!')
        .setDescription(`${message.author} kisses ${target}!`)
        .setImage(gifUrl);

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Kiss command error:', err);
      await message.reply('Failed to fetch a kiss GIF. Please try again later.');
    }
  },
};