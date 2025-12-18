const { EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
  name: 'translate',
  description: 'Translate text to English.',
  category: 'utility',
  usage: '$translate <text>',
  async execute(client, message, args) {
    if (!args.length) return message.reply('Please provide text to translate.');
    const text = args.join(' ');

    try {
      const res = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'auto', target: 'en', format: 'text' })
      });

      const data = await res.json();
      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Translation')
        .addFields(
          { name: 'Original', value: text },
          { name: 'English', value: data.translatedText || 'Error' }
        );

      message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Translate error:', err);
      message.reply('Failed to translate text.');
    }
  },
};