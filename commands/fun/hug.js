const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'hug',
  description: 'Send an anime hug GIF to a user.',
  category: 'fun',
  usage: '$hug @user',
  async execute(client, message) {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply('Please mention someone to hug. Example: `$hug @User`');
    }
    if (target.id === message.author.id) {
      return message.reply('You cannot hug yourself, but I can hug you! 🤗');
    }

    try {
      const res = await fetch('https://api.waifu.pics/sfw/hug');
      const data = await res.json();
      const gifUrl = data.url;

      const embed = new EmbedBuilder()
        .setColor(colors.banner || '#ec4899')
        .setTitle('Hug!')
        .setDescription(`${message.author} hugs ${target}!`)
        .setImage(gifUrl);

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Hug command error:', err);
      await message.reply('Failed to fetch a hug GIF. Please try again later.');
    }
  },
};