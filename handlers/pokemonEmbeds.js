'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const service = require('./pokemonService');
const { emoji } = require('./pokemonEmojis');

const THEME = '#3B82F6';

const TYPE_COLORS = Object.freeze({
  normal: 0xA8A878,
  fire: 0xF08030,
  water: 0x6890F0,
  electric: 0xF8D030,
  grass: 0x78C850,
  ice: 0x98D8D8,
  fighting: 0xC03028,
  poison: 0xA040A0,
  ground: 0xE0C068,
  flying: 0xA890F0,
  psychic: 0xF85888,
  bug: 0xA8B820,
  rock: 0xB8A038,
  ghost: 0x705898,
  dragon: 0x7038F8,
  dark: 0x705848,
  steel: 0xB8B8D0,
  fairy: 0xEE99AC,
});

function rarityInfo(rarity) {
  return service.CARD_RARITY[String(rarity || 'common').toLowerCase()] || service.CARD_RARITY.common;
}

function getTypes(card) {
  if (Array.isArray(card?.types)) return card.types.filter(Boolean).map(String);
  if (typeof card?.types === 'string') {
    try {
      const parsed = JSON.parse(card.types);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getPokemonColor(card, fallback = 0x3B82F6) {
  const types = getTypes(card);
  const colors = types.map(type => TYPE_COLORS[type.toLowerCase()]).filter(Number.isInteger);
  if (!colors.length) return fallback;

  const channels = colors.map(color => ({
    r: (color >> 16) & 255,
    g: (color >> 8) & 255,
    b: color & 255,
  }));
  const average = channels.reduce((acc, color) => ({
    r: acc.r + color.r / channels.length,
    g: acc.g + color.g / channels.length,
    b: acc.b + color.b / channels.length,
  }), { r: 0, g: 0, b: 0 });

  return (Math.round(average.r) << 16) | (Math.round(average.g) << 8) | Math.round(average.b);
}

function buildCardEmbed(card, index = 0, total = 1, counts = null) {
  const info = rarityInfo(card.rarity);
  const types = getTypes(card);
  const typeLabel = types.length
    ? types.map(type => type.charAt(0).toUpperCase() + type.slice(1)).join(' / ')
    : 'Unknown';
  const name = card.pokemon_name || card.name || 'Unknown Pokémon';

  const embed = new EmbedBuilder()
    .setColor(getPokemonColor(card, info.color))
    .setTitle(`${emoji('pokemon', '◈')}${name}`)
    .setDescription(`**${info.label} Pokémon Card**\n${typeLabel} type`)
    .addFields(
      { name: 'Card ID', value: `\`${card.card_id}\``, inline: true },
      { name: 'Generation', value: `Generation ${card.generation || '?'}`, inline: true },
      { name: 'Pokédex', value: `#${String(card.species_id || '').padStart(3, '0')}`, inline: true },
    )
    .setFooter({ text: `Card ${index + 1} / ${total}${counts ? ` • ${counts.common} Common • ${counts.rare} Rare • ${counts.mythical} Mythical` : ''}` })
    .setTimestamp();

  if (card.artwork_url) embed.setImage(card.artwork_url);
  return embed;
}

function buildPackButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pokemon:pack:${sessionId}:prev`)
      .setLabel('‹')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pokemon:pack:${sessionId}:next`)
      .setLabel('›')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pokemon:pack:${sessionId}:close`)
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary),
  );
}

// Discord does not offer a transparent button style. Secondary is the least
// visually prominent neutral style and keeps pagination subdued.
function buildBrowseButtons(sessionId, page, pages) {
  const current = Math.max(1, Number(page) || 1);
  const total = Math.max(1, Number(pages) || 1);
  const atStart = current <= 1;
  const atEnd = current >= total;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pokemon:browse:${sessionId}:first`)
      .setLabel('≪')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atStart),
    new ButtonBuilder()
      .setCustomId(`pokemon:browse:${sessionId}:prev`)
      .setLabel('‹')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atStart),
    new ButtonBuilder()
      .setCustomId(`pokemon:browse:${sessionId}:page`)
      .setLabel(`${current} / ${total}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pokemon:browse:${sessionId}:next`)
      .setLabel('›')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atEnd),
    new ButtonBuilder()
      .setCustomId(`pokemon:browse:${sessionId}:last`)
      .setLabel('≫')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atEnd),
  );
}

function buildInventoryEmbed(result, title, rarity = null, avatarURL = null) {
  const lines = (result.cards || []).map(card => {
    const info = rarityInfo(card.rarity);
    const types = getTypes(card);
    const typeLabel = types.length ? types.join(' / ') : 'Type unavailable';
    return `${emoji('pokemon', '◈')}**${card.pokemon_name || 'Unknown Pokémon'}** • ${info.label}\n${typeLabel} • Gen ${card.generation || '?'}\nID: \`${card.card_id}\``;
  });

  const embed = new EmbedBuilder()
    .setColor(THEME)
    .setTitle(title || 'Your Pokémon Inventory')
    .setDescription(lines.length ? lines.join('\n\n') : 'No cards found on this page.')
    .setFooter({
      text: `Page ${result.page}/${result.pages} • ${result.total} card(s)${rarity ? ` • ${rarityInfo(rarity).label}` : ''}`,
    })
    .setTimestamp();

  if (avatarURL) embed.setThumbnail(avatarURL);
  return embed;
}

function buildPokedexEmbed(result, generation = null) {
  const lines = (result.rows || []).map(row =>
    `${emoji(row.discovered ? 'discovered' : 'undiscovered', row.discovered ? '●' : '○')}${emoji('pokemon', '◈')}**#${String(row.species_id).padStart(3, '0')} ${row.name}** • ${emoji(row.rarity)}${rarityInfo(row.rarity).label}`
  );
  const percentage = result.total
    ? ((result.found / result.total) * 100).toFixed(1)
    : '0.0';

  return new EmbedBuilder()
    .setColor(THEME)
    .setTitle(`Pokédex${generation ? ` • Generation ${generation}` : ''}`)
    .setDescription(`**${result.found}/${result.total} discovered (${percentage}%)**\n\n${lines.join('\n') || 'No species found.'}`)
    .setFooter({
      text: `Page ${result.page}/${result.pages} • First discovery counts once; duplicates do not increase progress.`,
    })
    .setTimestamp();
}

function buildCollectionSummary(collection, cards, ownerLabel) {
  const embed = new EmbedBuilder()
    .setColor(collection.hex_color || THEME)
    .setTitle(`${emoji('collection', '')}${collection.name}`)
    .setDescription(`A collection by **${ownerLabel || 'Collector'}**  ·  **${cards.length}/8 Pokémon**`)
    .setFooter({ text: 'Each card can belong to one collection at a time.' })
    .setTimestamp();

  if (!cards.length) {
    embed.addFields({ name: 'Collection', value: 'No Pokémon have been added yet. Use `$p add <card ID> <collection name>` to add one.' });
    return embed;
  }

  const renderCard = (card, index) => {
    const info = rarityInfo(card.rarity);
    const types = getTypes(card);
    const typeLabel = types.length ? types.join(' / ') : 'Type unavailable';
    const artwork = card.artwork_url ? ` • [Artwork](${card.artwork_url})` : '';
    return `${emoji('pokemon', '◈')}**${index + 1}. ${card.pokemon_name || 'Unknown Pokémon'}**\n${info.label} • ${typeLabel} • Gen ${card.generation || '?'}\nID: \`${card.card_id}\`${artwork}`;
  };

  // Even-numbered slots form the left column; odd-numbered slots form the
  // right column. Inline fields display as a compact side-by-side grid.
  const left = cards.filter((_card, index) => index % 2 === 0)
    .map((card, index) => renderCard(card, index * 2));
  const right = cards.filter((_card, index) => index % 2 === 1)
    .map((card, index) => renderCard(card, index * 2 + 1));

  embed.addFields(
    { name: 'Column 1', value: left.join('\n\n').slice(0, 1024) || '\u200b', inline: true },
    { name: 'Column 2', value: right.join('\n\n').slice(0, 1024) || '\u200b', inline: true },
  );
  return embed;
}

async function buildCollectionGallery(cards, collection = {}, ownerLabel = '') {
  if (!Array.isArray(cards) || !cards.length) return null;

  let canvasModule;
  try {
    canvasModule = require('@napi-rs/canvas');
  } catch {
    return null;
  }

  const { createCanvas, loadImage } = canvasModule;
  const columns = 4;
  const rows = 2;
  const margin = 34;
  const gap = 16;
  const headerHeight = 104;
  const cellWidth = 314;
  const cellHeight = 286;
  const width = margin * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = margin * 2 + headerHeight + rows * cellHeight + gap;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const roundedRect = (x, y, w, h, radius) => {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const fitText = (text, maxWidth, baseSize = 19, minSize = 13, weight = '600') => {
    let size = baseSize;
    while (size > minSize) {
      ctx.font = `${weight} ${size}px sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 1;
    }
    ctx.font = `${weight} ${size}px sans-serif`;
    return text;
  };

  const title = String(collection.name || 'Pokémon Collection');
  const owner = String(ownerLabel || 'Collector');
  const accent = /^#?[0-9a-f]{6}$/i.test(String(collection.hex_color || ''))
    ? `#${String(collection.hex_color).replace('#', '')}`
    : '#3B82F6';

  // Quiet, cool neutral canvas with a single restrained accent.
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#F8FAFD');
  background.addColorStop(1, '#EFF3F8');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = accent;
  roundedRect(margin, 24, 42, 5, 3);
  ctx.fill();

  ctx.fillStyle = '#263247';
  ctx.font = '700 34px sans-serif';
  const titleText = title.length > 34 ? `${title.slice(0, 31)}…` : title;
  ctx.fillText(titleText, margin, 70);

  ctx.fillStyle = '#8190A5';
  ctx.font = '500 15px sans-serif';
  ctx.fillText(owner.toUpperCase(), margin, 94);

  const countText = `${cards.length} / 8  POKÉMON`;
  ctx.font = '600 14px sans-serif';
  const countWidth = ctx.measureText(countText).width + 30;
  roundedRect(width - margin - countWidth, 49, countWidth, 34, 17);
  ctx.fillStyle = '#E7EDF5';
  ctx.fill();
  ctx.fillStyle = '#63738A';
  ctx.textAlign = 'center';
  ctx.fillText(countText, width - margin - countWidth / 2, 71);
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#E3E9F1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, headerHeight + margin - 3);
  ctx.lineTo(width - margin, headerHeight + margin - 3);
  ctx.stroke();

  const drawJobs = cards.slice(0, 8).map(async (card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (cellWidth + gap);
    const y = margin + headerHeight + row * (cellHeight + gap);
    const info = rarityInfo(card.rarity);
    const types = getTypes(card).map(type =>
      String(type).charAt(0).toUpperCase() + String(type).slice(1)
    );
    const typeLabel = types.length ? types.join(' / ') : 'Unknown type';
    const typeColor = getPokemonColor(card, 0x8FA3BD);

    // Soft white tile, with a subtle shadow and no heavy frames.
    ctx.save();
    ctx.shadowColor = 'rgba(37, 54, 78, 0.07)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    roundedRect(x, y, cellWidth, cellHeight, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    roundedRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1, 20);
    ctx.strokeStyle = '#E8EDF4';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pale artwork well gives transparent sprite edges a consistent backdrop.
    const centerX = x + cellWidth / 2;
    const centerY = y + 91;
    const artGlow = ctx.createRadialGradient(centerX, centerY, 8, centerX, centerY, 79);
    artGlow.addColorStop(0, '#FFFFFF');
    artGlow.addColorStop(1, '#F2F6FB');
    ctx.beginPath();
    ctx.arc(centerX, centerY, 77, 0, Math.PI * 2);
    ctx.fillStyle = artGlow;
    ctx.fill();

    if (card.artwork_url) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      try {
        const response = await fetch(card.artwork_url, { signal: controller.signal });
        if (response.ok) {
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 0 && bytes.length <= 5 * 1024 * 1024) {
            const image = await loadImage(bytes);
            const maxWidth = 164;
            const maxHeight = 164;
            const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
            const drawWidth = image.width * scale;
            const drawHeight = image.height * scale;
            ctx.drawImage(
              image,
              centerX - drawWidth / 2,
              centerY - drawHeight / 2,
              drawWidth,
              drawHeight
            );
          }
        }
      } catch {
        // Keep the tile clean even if this Pokémon's artwork cannot be loaded.
      } finally {
        clearTimeout(timer);
      }
    }

    const name = String(card.pokemon_name || 'Unknown Pokémon');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#263247';
    fitText(name, cellWidth - 34, 20, 13, '700');
    ctx.fillText(name, centerX, y + 195);

    // A tiny type-colour accent separates the artwork from its metadata.
    ctx.fillStyle = `#${typeColor.toString(16).padStart(6, '0')}`;
    roundedRect(centerX - 17, y + 207, 34, 3, 2);
    ctx.fill();

    ctx.fillStyle = '#718198';
    fitText(typeLabel, cellWidth - 32, 14, 11, '500');
    ctx.fillText(typeLabel, centerX, y + 232);

    ctx.fillStyle = '#9AA7B8';
    ctx.font = '500 12px sans-serif';
    ctx.fillText(`${info.label}  ·  Gen ${card.generation || '?'}`, centerX, y + 254);

    ctx.fillStyle = '#B0BAC8';
    ctx.font = '500 11px sans-serif';
    ctx.fillText(`ID  ${String(card.card_id || '------')}`, centerX, y + 274);
    ctx.textAlign = 'left';
  });

  await Promise.all(drawJobs);
  return new AttachmentBuilder(canvas.toBuffer('image/png'), {
    name: 'pokemon-collection.png',
  });
}

function buildCollectionCardEmbeds(cards) {
  return cards.map((card, index) => {
    const info = rarityInfo(card.rarity);
    const types = getTypes(card);
    const typeLabel = types.length ? types.join(' / ') : 'Type unavailable';
    const embed = new EmbedBuilder()
      .setColor(getPokemonColor(card, info.color))
      .setTitle(`${index + 1}. ${emoji('pokemon', '◈')}${card.pokemon_name || 'Unknown Pokémon'}`)
      .setDescription(`${info.label} • ${typeLabel} • Gen ${card.generation || '?'}\nCard ID: \`${card.card_id}\` • Pokédex: #${String(card.species_id || '').padStart(3, '0')}`);
    if (card.artwork_url) embed.setImage(card.artwork_url);
    return embed;
  });
}

function buildSimpleEmbed(title, description, color = THEME) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}

module.exports = {
  THEME,
  TYPE_COLORS,
  rarityInfo,
  getTypes,
  getPokemonColor,
  buildCardEmbed,
  buildPackButtons,
  buildBrowseButtons,
  buildInventoryEmbed,
  buildPokedexEmbed,
  buildCollectionSummary,
  buildCollectionGallery,
  buildCollectionCardEmbeds,
  buildSimpleEmbed,
};
