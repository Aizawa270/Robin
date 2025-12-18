const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');
const FormData = require('form-data');

module.exports = {
  name: 'removebackground',
  aliases: ['rbg'],
  description: 'Removes the background from an image.',
  category: 'utility',
  usage: '$removebackground (attach image)',
  async execute(client, message) {
    const apiKey = process.env.REMOVEBG_API_KEY;

    if (!apiKey) {
      return message.reply('❌ Background remover API is not configured.');
    }

    const attachment = message.attachments.first();
    if (!attachment) {
      return message.reply('❌ Attach an image to remove its background.');
    }

    const loadingEmbed = new EmbedBuilder()
      .setColor('#38bdf8')
      .setDescription('🧠 Removing background… hold up.');

    const msg = await message.reply({ embeds: [loadingEmbed] });

    try {
      const form = new FormData();
      form.append('image_url', attachment.url);
      form.append('size', 'auto');

      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
        },
        body: form,
      });

      if (!res.ok) {
        throw new Error(`API Error: ${res.status}`);
      }

      const buffer = await res.buffer();
      const file = new AttachmentBuilder(buffer, { name: 'no-bg.png' });

      const doneEmbed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Background Removed')
        .setDescription('Here you go 🧼');

      await msg.edit({
        embeds: [doneEmbed],
        files: [file],
      });
    } catch (err) {
      console.error('RemoveBG error:', err);
      await msg.edit({
        content: '❌ Failed to remove background.',
        embeds: [],
      });
    }
  },
};