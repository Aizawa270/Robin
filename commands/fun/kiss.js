const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require('node-fetch');
  } catch {}
}

async function resolveTargetUser(client, message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(input).catch(() => null);
  }

  const raw = String(input).trim();
  if (!raw) return null;

  const id = raw.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = raw.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered ||
    u?.tag?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  return null;
}

module.exports = {
  name: 'kiss',
  description: 'Send an anime kiss GIF to a user.',
  category: 'fun',
  usage: '$kiss @user|username|id',

  async execute(client, message, args) {
    const target = message.mentions.users.first() || await resolveTargetUser(client, message, args[0]);

    if (!target) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle('Kiss Usage')
            .setDescription('Please provide a user.\nExample: `$kiss @User`')
            .setTimestamp()
        ]
      });
    }

    if (target.id === message.author.id) {
      return message.reply('You cannot kiss yourself…');
    }

    try {
      if (!fetchFn) {
        return message.reply('Fetch is not available right now.');
      }

      const res = await fetchFn('https://api.waifu.pics/sfw/kiss');
      const data = await res.json();
      const gifUrl = data.url;

      const embed = new EmbedBuilder()
        .setColor(colors.banner || '#ec4899')
        .setTitle('Kiss!')
        .setDescription(`${message.author} kisses ${target}!`)
        .setImage(gifUrl)
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Kiss command error:', err);
      await message.reply('Failed to fetch a kiss GIF. Please try again later.');
    }
  },
};