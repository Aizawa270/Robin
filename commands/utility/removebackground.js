const fs = require('fs');
const fetch = require('node-fetch'); // use version 2
const { EmbedBuilder } = require('discord.js');
const apiKey = process.env.REMOVEBG_API_KEY;

module.exports = {
  name: 'removebg',
  description: 'Remove background from an image',
  category: 'utility',
  usage: '$removebg <attach image>',
  async execute(client, message, args) {
    const attachment = message.attachments.first();
    if (!attachment) return message.reply('Please attach an image.');

    const inputPath = `./temp_${message.id}.png`;
    const outputPath = `./temp_${message.id}_out.png`;

    // Download attachment
    const res = await fetch(attachment.url);
    const buffer = await res.buffer();
    fs.writeFileSync(inputPath, buffer);

    try {
      // Remove background
      const FormData = require('form-data');
      const form = new FormData();
      form.append('image_file', fs.readFileSync(inputPath), 'image.png');
      form.append('size', 'auto');

      const apiRes = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: form
      });

      if (!apiRes.ok) {
        const text = await apiRes.text();
        return message.reply(`Remove.bg API error: ${text}`);
      }

      const outBuffer = await apiRes.buffer();
      fs.writeFileSync(outputPath, outBuffer);

      await message.reply({ files: [outputPath] });

    } catch (err) {
      console.error(err);
      message.reply('Something went wrong while removing the background.');
    } finally {
      // Clean up
      fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }
};