const { AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');

module.exports = {
  name: 'quote',
  description: 'Generate an image with your quote text.',
  category: 'fun',
  usage: '$quote [@user] <text>',
  async execute(client, message, args) {
    if (!args.length) {
      return message.reply('Please provide some text. Example: `$quote @User This bot is crazy`');
    }

    // If first arg is a mention → that user is the quote author
    const mentionedUser = message.mentions.users.first();
    let quoteAuthor = message.author;
    let textArgs = args;

    if (mentionedUser) {
      quoteAuthor = mentionedUser;
      textArgs = args.slice(1); // drop the mention token
      if (!textArgs.length) {
        return message.reply('Please provide the quote text after the mention.');
      }
    }

    const quoteText = textArgs.join(' ');

    // Canvas size
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const padding = 60;
    const maxWidth = width - padding * 2;

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Bold font for the quote text
    const quoteFont = 'bold 40px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.font = quoteFont;

    function wrapText(text, x, y, maxWidth, lineHeight) {
      const words = text.split(' ');
      let line = '';
      const lines = [];

      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) lines.push(line);

      const totalHeight = lines.length * lineHeight;
      let offsetY = y - totalHeight / 2 + lineHeight / 2;

      for (const l of lines) {
        ctx.fillText(l, x, offsetY);
        offsetY += lineHeight;
      }
    }

    const centerX = width / 2;
    const centerY = height / 2;

    // Draw the quote in bold
    wrapText(`“${quoteText}”`, centerX, centerY, maxWidth, 48);

    // Bottom tag: quoted user (smaller, regular weight)
    ctx.font = '20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`– ${quoteAuthor.tag}`, width - padding, height - padding / 2);

    const buffer = await canvas.encode('png');
    const attachment = new AttachmentBuilder(buffer, { name: 'quote.png' });

    await message.reply({ files: [attachment] });
  },
};