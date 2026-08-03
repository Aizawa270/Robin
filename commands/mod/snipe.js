// commands/utility/snipe.js
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.(png|jpe?g|gif|webp|bmp|avif)(\?.*)?$/i.test(url);
}

function pickBestMedia(media) {
  if (!Array.isArray(media) || !media.length) return null;

  // Prefer image/gif media first
  const imageLike = media.find((m) => {
    const url = m?.proxyURL || m?.url || '';
    const contentType = m?.contentType || '';
    return (
      contentType.startsWith('image/') ||
      isImageUrl(url)
    );
  });

  return imageLike || media[0];
}

function normalizeMediaList(data) {
  const out = [];

  // New format: media[]
  if (Array.isArray(data?.media)) {
    for (const item of data.media) {
      if (!item) continue;
      out.push({
        type: item.type || 'attachment',
        url: item.url || item.proxyURL || '',
        proxyURL: item.proxyURL || item.url || '',
        contentType: item.contentType || null,
        name: item.name || null,
      });
    }
  }

  // Old format: attachments[]
  if (Array.isArray(data?.attachments)) {
    for (const item of data.attachments) {
      if (!item) continue;

      if (typeof item === 'string') {
        out.push({
          type: 'attachment',
          url: item,
          proxyURL: item,
          contentType: null,
          name: null,
        });
      } else if (typeof item === 'object') {
        out.push({
          type: item.type || 'attachment',
          url: item.url || item.proxyURL || '',
          proxyURL: item.proxyURL || item.url || '',
          contentType: item.contentType || null,
          name: item.name || null,
        });
      }
    }
  }

  // Old/other format: embeds that may contain image URLs
  if (Array.isArray(data?.embeds)) {
    for (const item of data.embeds) {
      if (!item) continue;

      const imageUrl =
        item.image?.url ||
        item.thumbnail?.url ||
        item.url ||
        '';

      if (imageUrl) {
        out.push({
          type: 'embed',
          url: imageUrl,
          proxyURL: imageUrl,
          contentType: item.type === 'gifv' ? 'image/gif' : null,
          name: item.title || item.provider?.name || 'embedded media',
        });
      }
    }
  }

  return out;
}

module.exports = {
  name: 'snipe',
  description: 'Shows deleted messages. Usage: $snipe [1-15]',
  aliases: ['s'],
  category: 'utility',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You need the **Manage Messages** permission to use this command.')
        ]
      });
    }

    const snipes = client.snipes.get(message.channel.id) || [];
    if (!snipes.length) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f59e0b')
            .setDescription('No deleted messages found in this channel.')
        ]
      });
    }

    let index = parseInt(args[0], 10);
    if (isNaN(index) || index < 1) index = 1;
    if (index > snipes.length) index = snipes.length;

    const data = snipes[index - 1];
    const media = normalizeMediaList(data);
    const bestMedia = pickBestMedia(media);

    const embed = new EmbedBuilder()
      .setColor('Orange')
      .setAuthor({
        name: data.author?.tag || 'Unknown User',
        iconURL: data.author?.displayAvatarURL?.({ dynamic: true }) || undefined,
      })
      .setDescription(data.content || '[No Text Content]')
      .setTimestamp(data.createdAt || Date.now());

    const footerParts = [`Snipe ${index} of ${snipes.length}`];

    if (bestMedia) {
      const imageUrl = bestMedia.proxyURL || bestMedia.url;
      if (imageUrl && (bestMedia.contentType?.startsWith('image/') || isImageUrl(imageUrl))) {
        embed.setImage(imageUrl);
      }
    }

    if (media.length) {
      const MAX = 10;
      const links = media.slice(0, MAX).map((m, i) => {
        const url = m.proxyURL || m.url;
        const label =
          m.type === 'attachment'
            ? (m.name || `file ${i + 1}`)
            : (m.name || `embed ${i + 1}`);

        return url ? `[${label}](${url})` : `\`${label}\``;
      }).join('\n');

      let value = links;
      if (media.length > MAX) {
        value += `\n...and ${media.length - MAX} more`;
      }

      embed.addFields({ name: 'Media', value: value || 'None' });

      const typeHint = bestMedia?.contentType?.split('/')?.[0] || bestMedia?.type || 'media';
      footerParts.push(typeHint);
    }

    if (Array.isArray(data.stickers) && data.stickers.length) {
      const stickerNames = data.stickers
        .map(s => s?.name)
        .filter(Boolean)
        .join(', ');

      if (stickerNames) {
        embed.addFields({ name: 'Stickers', value: stickerNames });
      }

      footerParts.push(`${data.stickers.length} sticker(s)`);
    }

    embed.setFooter({ text: footerParts.join(' • ') });

    return message.reply({ embeds: [embed] });
  },
};