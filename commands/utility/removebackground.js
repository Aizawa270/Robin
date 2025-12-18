const { EmbedBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch);

module.exports = {
  name: 'removebg',
  description: 'Remove the background of an attached image.',
  category: 'utility',
  usage: '$removebg (attach an image)',
  aliases: ['rb'],
  async execute(client, message, args) {
    const attachment = message.attachments.first();
    if (!attachment) return message.reply('Please attach an image.');

    try {
      const formData = new FormData();
      formData.append('image_url', attachment.url);
      formData.append('size', 'auto');

      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': process.env.REMOVEBG_API_KEY },
        body: formData
      });

      if (!res.ok) return message.reply('Failed to remove background.');

      const buffer = Buffer.from(await res.arrayBuffer());
      await message.reply({ files: [{ attachment: buffer, name: 'no-bg.png' }] });
    } catch (err) {
      console.error('RemoveBG error:', err);
      message.reply('There was an error removing the background.');
    }
  },
};