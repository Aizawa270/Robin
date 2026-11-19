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
    .setDescription(`**${cards.length}/8 Pokémon** • ${ownerLabel || 'Collection'}\nA 4 × 2 gallery keeps the entire collection in one view.`)
    .setFooter({ text: 'A card can only belong to one collection at a time.' })
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

async function buildCollectionGallery(cards) {
  if (!Array.isArray(cards) || !cards.length) return null;

  let canvasModule;
  try {
    canvasModule = require('@napi-rs/canvas');
  } catch {
    return null;
  }

  const { createCanvas, loadImage } = canvasModule;
  const columns = 4;
  const cellWidth = 276;
  const cellHeight = 238;
  const gap = 14;
  const margin = 20;
  const headerHeight = 66;
  const width = margin * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = margin + headerHeight + 2 * cellHeight + gap + margin;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#172337';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#EAF2FF';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('POKÉMON COLLECTION', margin, 42);
  ctx.fillStyle = '#91A9C9';
  ctx.font = '15px sans-serif';
  ctx.fillText('VANESSA • COLLECTION GALLERY', margin, 60);

  const drawJobs = cards.slice(0, 8).map(async (card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (cellWidth + gap);
    const y = margin + headerHeight + row * (cellHeight + gap);
    const info = rarityInfo(card.rarity);
    const color = getPokemonColor(card, info.color);

    ctx.fillStyle = '#243650';
    ctx.fillRect(x, y, cellWidth, cellHeight);
    ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, cellWidth - 3, cellHeight - 3);

    if (card.artwork_url) {
      let response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      try {
        response = await fetch(card.artwork_url, { signal: controller.signal });
        if (response.ok) {
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length <= 5 * 1024 * 1024) {
            const image = await loadImage(bytes);
            const maxWidth = cellWidth - 28;
            const maxHeight = 158;
            const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
            const drawWidth = image.width * scale;
            const drawHeight = image.height * scale;
            ctx.drawImage(
              image,
              x + (cellWidth - drawWidth) / 2,
              y + 8 + (maxHeight - drawHeight) / 2,
              drawWidth,
              drawHeight
            );
          }
        }
      } catch {
        // The text card remains usable when artwork cannot be fetched.
      } finally {
        clearTimeout(timer);
      }
    }

    const name = String(card.pokemon_name || 'Unknown Pokémon');
    ctx.fillStyle = '#F4F7FC';
    ctx.font = 'bold 17px sans-serif';
    const safeName = name.length > 23 ? `${name.slice(0, 20)}…` : name;
    ctx.fillText(safeName, x + 12, y + 185);
    ctx.fillStyle = '#AFC2DE';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${info.label} • Gen ${card.generation || '?'}`, x + 12, y + 207);
    ctx.fillText(`Card ID: ${card.card_id}`, x + 12, y + 226);
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
