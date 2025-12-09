const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'slap',
  description: 'Send an anime slap GIF to a user.',
  category: 'fun',
  usage: '$slap @user',
  async execute(client, message) {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply('Please mention someone to slap. Example: `$slap @User`');
    }
    if (target.id === message.author.id) {
      return message.reply('Why are you trying to slap yourself..?');
    }

    try {
      const res = await fetch('https://api.waifu.pics/sfw/slap');
      const data = await res.json();
      const gifUrl = data.url;

      const embed = new EmbedBuilder()
        .setColor(colors.banner || '#ec4899')
        .setTitle('Slap!')
        .setDescription(`${message.author} slaps ${target}!`)
        .setImage(gifUrl);

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Slap command error:', err);
      await message.reply('Failed to fetch a slap GIF. Please try again later.');
    }
  },
};