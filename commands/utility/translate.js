const { EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch'); // make sure to install node-fetch v2 if on Node <18

module.exports = {
  name: 'translate',
  description: 'Translate any text to English.',
  category: 'utility',
  usage: '$translate <text>',
  aliases: ['tr'],
  async execute(client, message, args) {
    if (!args.length) return message.reply('Please provide some text to translate. Example: `$translate Bonjour`');

    const text = args.join(' ');

    try {
      const response = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        body: JSON.stringify({
          q: text,
          source: 'auto',
          target: 'en',
          format: 'text'
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!data.translatedText) {
        return message.reply('Translation failed. Try again later.');
      }

      const embed = new EmbedBuilder()
        .setTitle('Translation')
        .setColor('#22c55e')
        .addFields(
          { name: 'Original', value: text, inline: false },
          { name: 'Translated (to English)', value: data.translatedText, inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Translate command error:', err);
      message.reply('Something went wrong while translating.');
    }
  }
};