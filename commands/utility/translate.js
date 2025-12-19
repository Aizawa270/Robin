const { EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
  name: 'translate',
  description: 'Translate text to another language. Usage: $translate <lang_code> <text>',
  category: 'utility',
  usage: '$translate <lang_code> <text>',
  aliases: ['tr'],
  async execute(client, message, args) {
    if (!args.length) return message.reply('Please provide a language code and text to translate.');
    
    const targetLang = args.shift().toLowerCase(); // first arg = target language code
    const text = args.join(' ');
    if (!text) return message.reply('Please provide text to translate.');

    try {
      const res = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: 'auto',    // detect source automatically
          target: targetLang,
          format: 'text'
        })
      });

      const data = await res.json();

      if (!data.translatedText) return message.reply('Failed to get translation.');

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Translation')
        .addFields(
          { name: 'Original', value: text },
          { name: 'Translated', value: data.translatedText }
        );

      message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Translate error:', err);
      message.reply('Failed to translate text. Make sure your language code is correct (e.g., en, fr, es).');
    }
  },
};