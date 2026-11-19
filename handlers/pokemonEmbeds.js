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
  return service.CARD_RARITY[String(rarity || 'common').toLowerCase()]
    || service.CARD_RARITY.common;
}

function getTypes(card) {
  if (Array.isArray(card?.types)) {
    return card.types.filter(Boolean).map(String);
  }

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

  const colors = types
    .map(type => TYPE_COLORS[type.toLowerCase()])
    .filter(Number.isInteger);

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

  return (
    (Math.round(average.r) << 16) |
    (Math.round(average.g) << 8) |
    Math.round(average.b)
  );
}

// ======================================================
// POKEMON CARD EMBED
// ======================================================

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
      {
        name: 'Card ID',
        value: `\`${card.card_id}\``,
        inline: true,
      },
      {
        name: 'Generation',
        value: `Generation ${card.generation || '?'}`,
        inline: true,
      },
      {
        name: 'Pokédex',
        value: `#${String(card.species_id || '').padStart(3, '0')}`,
        inline: true,
      },
    )
    .setFooter({
      text: `Card ${index + 1} / ${total}${counts
        ? ` • ${counts.common} Common • ${counts.rare} Rare • ${counts.mythical} Mythical`
        : ''
      }`,
    })
    .setTimestamp();

  if (card.artwork_url) {
    embed.setImage(card.artwork_url);
  }

  return embed;
}

// ======================================================
// PACK PAGINATION BUTTONS
// ======================================================

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

// ======================================================
// INVENTORY / BROWSE PAGINATION BUTTONS
// ======================================================

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

// ======================================================
// INVENTORY EMBED
// ======================================================

function buildInventoryEmbed(result, title, rarity = null, avatarURL = null) {
  const lines = (result.cards || []).map(card => {
    const info = rarityInfo(card.rarity);
    const types = getTypes(card);

    const typeLabel = types.length
      ? types.join(' / ')
      : 'Type unavailable';

    return `${emoji('pokemon', '◈')}**${card.pokemon_name || 'Unknown Pokémon'}** • ${info.label}
${typeLabel} • Gen ${card.generation || '?'}
ID: \`${card.card_id}\``;
  });

  const embed = new EmbedBuilder()
    .setColor(THEME)
    .setTitle(title || 'Your Pokémon Inventory')
    .setDescription(
      lines.length
        ? lines.join('\n\n')
        : 'No cards found on this page.'
    )
    .setFooter({
      text: `Page ${result.page}/${result.pages} • ${result.total} card(s)${rarity
        ? ` • ${rarityInfo(rarity).label}`
        : ''
      }`,
    })
    .setTimestamp();

  if (avatarURL) {
    embed.setThumbnail(avatarURL);
  }

  return embed;
}

// ======================================================
// POKEDEX EMBED
// ======================================================

function buildPokedexEmbed(result, generation = null) {
  const lines = (result.rows || []).map(row =>
    `${emoji(
      row.discovered ? 'discovered' : 'undiscovered',
      row.discovered ? '●' : '○'
    )}${emoji('pokemon', '◈')}**#${String(row.species_id).padStart(3, '0')} ${row.name}** • ${emoji(row.rarity)}${rarityInfo(row.rarity).label}`
  );

  const percentage = result.total
    ? ((result.found / result.total) * 100).toFixed(1)
    : '0.0';

  return new EmbedBuilder()
    .setColor(THEME)
    .setTitle(`Pokédex${generation ? ` • Generation ${generation}` : ''}`)
    .setDescription(
      `**${result.found}/${result.total} discovered (${percentage}%)**\n\n${lines.join('\n') || 'No species found.'}`
    )
    .setFooter({
      text: `Page ${result.page}/${result.pages} • First discovery counts once; duplicates do not increase progress.`,
    })
    .setTimestamp();
}

// ======================================================
// COLLECTION SUMMARY EMBED
// ======================================================

function buildCollectionSummary(collection, cards, ownerLabel) {
  const embed = new EmbedBuilder()
    .setColor(collection.hex_color || THEME)
    .setTitle(`${emoji('collection', '')}${collection.name}`)
    .setDescription(
      `A collection by **${ownerLabel || 'Collector'}**  ·  **${cards.length}/8 Pokémon**`
    )
    .setFooter({
      text: 'Each card can belong to one collection at a time.',
    })
    .setTimestamp();

  if (!cards.length) {
    embed.addFields({
      name: 'Collection',
      value: 'No Pokémon have been added yet. Use `$p add <card ID> <collection name>` to add one.',
    });

    return embed;
  }

  const renderCard = (card, index) => {
    const info = rarityInfo(card.rarity);
    const types = getTypes(card);

    const typeLabel = types.length
      ? types.join(' / ')
      : 'Type unavailable';

    const artwork = card.artwork_url
      ? ` • [Artwork](${card.artwork_url})`
      : '';

    return `${emoji('pokemon', '◈')}**${index + 1}. ${card.pokemon_name || 'Unknown Pokémon'}**
${info.label} • ${typeLabel} • Gen ${card.generation || '?'}
ID: \`${card.card_id}\`${artwork}`;
  };

  const left = cards
    .filter((_card, index) => index % 2 === 0)
    .map((card, index) => renderCard(card, index * 2));

  const right = cards
    .filter((_card, index) => index % 2 === 1)
    .map((card, index) => renderCard(card, index * 2 + 1));

  embed.addFields(
    {
      name: 'Column 1',
      value: left.join('\n\n').slice(0, 1024) || '\u200b',
      inline: true,
    },
    {
      name: 'Column 2',
      value: right.join('\n\n').slice(0, 1024) || '\u200b',
      inline: true,
    },
  );

  return embed;
}

// ======================================================
// COLLECTION GALLERY
// PREMIUM 4x2 POKEMON DISPLAY
// ======================================================

async function buildCollectionGallery(cards, collection = {}, ownerLabel = '') {
  if (!Array.isArray(cards) || !cards.length) {
    return null;
  }

  let canvasModule;

  try {
    canvasModule = require('@napi-rs/canvas');
  } catch {
    return null;
  }

  const { createCanvas, loadImage } = canvasModule;

  // Canvas dimensions
  const width = 1400;
  const height = 840;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Grid configuration
  const columns = 4;
  const margin = 42;
  const gap = 18;
  const startY = 142;

  const cardWidth = (width - margin * 2 - gap * 3) / 4;
  const cardHeight = 330;

  const visibleCards = cards.slice(0, 8);

  // --------------------------------------------------
  // COLOR HELPERS
  // --------------------------------------------------

  const parseColor = (value, fallback = 0x3B82F6) => {
    if (Number.isInteger(value)) {
      return value & 0xFFFFFF;
    }

    const cleaned = String(value || '').replace('#', '');

    if (/^[0-9a-f]{6}$/i.test(cleaned)) {
      return parseInt(cleaned, 16);
    }

    return fallback;
  };

  const rgb = color => ({
    r: (color >> 16) & 255,
    g: (color >> 8) & 255,
    b: color & 255,
  });

  const rgba = (color, alpha = 1) => {
    const c = rgb(color);

    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  };

  const accent = parseColor(collection.hex_color);

  // --------------------------------------------------
  // DRAWING HELPERS
  // --------------------------------------------------

  const roundedPath = (x, y, w, h, radius) => {
    const r = Math.min(radius, w / 2, h / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const fillRounded = (x, y, w, h, radius, color) => {
    roundedPath(x, y, w, h, radius);

    ctx.fillStyle = color;
    ctx.fill();
  };

  const strokeRounded = (x, y, w, h, radius, color, lineWidth = 1) => {
    roundedPath(x, y, w, h, radius);

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  const fitFont = (
    text,
    maxWidth,
    startSize = 22,
    minSize = 13,
    weight = 700
  ) => {
    let size = startSize;

    do {
      ctx.font = `${weight} ${size}px sans-serif`;

      if (ctx.measureText(String(text)).width <= maxWidth) {
        break;
      }

      size--;
    } while (size >= minSize);

    ctx.font = `${weight} ${Math.max(size, minSize)}px sans-serif`;
  };

  // --------------------------------------------------
  // MAIN BACKGROUND
  // --------------------------------------------------

  const background = ctx.createLinearGradient(
    0, 0,
    width, height
  );

  background.addColorStop(0, '#080F20');
  background.addColorStop(0.5, '#101B33');
  background.addColorStop(1, '#0A1225');

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // Soft collection-color glow
  const glow = ctx.createRadialGradient(
    width - 160,
    70,
    10,
    width - 160,
    70,
    620
  );

  glow.addColorStop(0, rgba(accent, 0.20));
  glow.addColorStop(1, 'rgba(10, 18, 37, 0)');

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Decorative background rings
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#8DBBFF';
  ctx.lineWidth = 1;

  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(
      width - 80,
      40,
      60 + i * 23,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // --------------------------------------------------
  // HEADER
  // --------------------------------------------------

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.font = '700 13px sans-serif';
  ctx.fillStyle = rgba(accent, 1);

  ctx.fillText(
    'POKÉMON COLLECTION',
    margin,
    31
  );

  const collectionName = String(
    collection.name || 'My Collection'
  );

  fitFont(
    collectionName,
    850,
    36,
    22,
    700
  );

  ctx.fillStyle = '#F4F7FF';

  ctx.fillText(
    collectionName,
    margin,
    70
  );

  ctx.font = '500 15px sans-serif';
  ctx.fillStyle = '#8291AC';

  ctx.fillText(
    `Collected by ${ownerLabel || 'Collector'}`,
    margin,
    108
  );

  // Collection counter
  const counterWidth = 174;
  const counterX = width - margin - counterWidth;

  fillRounded(
    counterX,
    47,
    counterWidth,
    43,
    13,
    rgba(accent, 0.15)
  );

  strokeRounded(
    counterX,
    47,
    counterWidth,
    43,
    13,
    rgba(accent, 0.45),
    1
  );

  ctx.textAlign = 'center';
  ctx.font = '700 15px sans-serif';
  ctx.fillStyle = '#EAF2FF';

  ctx.fillText(
    `${visibleCards.length} / 8 COLLECTED`,
    counterX + counterWidth / 2,
    69
  );

  // --------------------------------------------------
  // RARITY COLORS
  // --------------------------------------------------

  const rarityColors = {
    common: 0x94A3B8,
    uncommon: 0x4ADE80,
    rare: 0x60A5FA,
    epic: 0xA78BFA,
    legendary: 0xFBBF24,
    mythical: 0xF472B6,
  };

  // --------------------------------------------------
  // EMPTY SLOT DISPLAY
  // --------------------------------------------------

  const drawEmptySlot = (x, y, index) => {
    fillRounded(
      x,
      y,
      cardWidth,
      cardHeight,
      20,
      '#111D34'
    );

    strokeRounded(
      x,
      y,
      cardWidth,
      cardHeight,
      20,
      'rgba(139, 160, 195, 0.17)',
      1
    );

    const centerX = x + cardWidth / 2;
    const centerY = y + 150;

    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      45,
      0,
      Math.PI * 2
    );

    ctx.strokeStyle = 'rgba(139, 160, 195, 0.28)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 7]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '300 42px sans-serif';
    ctx.fillStyle = 'rgba(160, 179, 210, 0.55)';

    ctx.fillText(
      '+',
      centerX,
      centerY
    );

    ctx.font = '700 12px sans-serif';
    ctx.fillStyle = '#72819C';

    ctx.fillText(
      `EMPTY SLOT ${String(index + 1).padStart(2, '0')}`,
      centerX,
      y + 224
    );
  };

  // --------------------------------------------------
  // DRAW INDIVIDUAL POKEMON
  // --------------------------------------------------

  const drawPokemon = async (card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);

    const x = margin + column * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);

    const info = rarityInfo(card.rarity);

    const rarityKey = String(
      card.rarity || 'common'
    ).toLowerCase();

    const rarityColor =
      rarityColors[rarityKey] ||
      parseColor(info.color, accent);

    const pokemonColor = getPokemonColor(card, accent);

    const centerX = x + cardWidth / 2;
    const artworkCenterY = y + 150;

    // Card background
    const panelGradient = ctx.createLinearGradient(
      x,
      y,
      x + cardWidth,
      y + cardHeight
    );

    panelGradient.addColorStop(0, '#17243D');
    panelGradient.addColorStop(1, '#101A30');

    ctx.save();

    ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;

    fillRounded(
      x,
      y,
      cardWidth,
      cardHeight,
      20,
      panelGradient
    );

    ctx.restore();

    // Card border
    strokeRounded(
      x,
      y,
      cardWidth,
      cardHeight,
      20,
      rgba(pokemonColor, 0.38),
      1.2
    );

    // Card number
    ctx.textAlign = 'left';
    ctx.font = '700 12px sans-serif';
    ctx.fillStyle = '#8192AE';

    ctx.fillText(
      `NO. ${String(index + 1).padStart(2, '0')}`,
      x + 19,
      y + 26
    );

    // Rarity badge
    const rarityLabel = String(
      info.label || 'Common'
    ).toUpperCase();

    ctx.font = '700 10px sans-serif';

    const badgeWidth = Math.max(
      68,
      ctx.measureText(rarityLabel).width + 22
    );

    const badgeX = x + cardWidth - badgeWidth - 17;

    fillRounded(
      badgeX,
      y + 14,
      badgeWidth,
      25,
      8,
      rgba(rarityColor, 0.17)
    );

    strokeRounded(
      badgeX,
      y + 14,
      badgeWidth,
      25,
      8,
      rgba(rarityColor, 0.45),
      1
    );

    ctx.textAlign = 'center';
    ctx.fillStyle = rarityColor;

    ctx.fillText(
      rarityLabel,
      badgeX + badgeWidth / 2,
      y + 27
    );

    // Artwork glow
    const artworkGlow = ctx.createRadialGradient(
      centerX,
      artworkCenterY,
      5,
      centerX,
      artworkCenterY,
      112
    );

    artworkGlow.addColorStop(
      0,
      rgba(pokemonColor, 0.22)
    );

    artworkGlow.addColorStop(
      1,
      rgba(pokemonColor, 0)
    );

    ctx.fillStyle = artworkGlow;

    ctx.beginPath();
    ctx.arc(
      centerX,
      artworkCenterY,
      112,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Artwork circle
    ctx.beginPath();

    ctx.arc(
      centerX,
      artworkCenterY,
      83,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.fill();

    ctx.strokeStyle = rgba(pokemonColor, 0.28);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Load and display actual Pokémon artwork
    if (card.artwork_url) {
      const controller = new AbortController();

      const timeout = setTimeout(
        () => controller.abort(),
        7000
      );

      try {
        const response = await fetch(card.artwork_url, {
          signal: controller.signal,
        });

        if (response.ok) {
          const bytes = Buffer.from(
            await response.arrayBuffer()
          );

          if (
            bytes.length > 0 &&
            bytes.length <= 5 * 1024 * 1024
          ) {
            const image = await loadImage(bytes);

            const maxSize = 174;

            const scale = Math.min(
              maxSize / image.width,
              maxSize / image.height,
              1
            );

            const drawWidth = image.width * scale;
            const drawHeight = image.height * scale;

            ctx.drawImage(
              image,
              centerX - drawWidth / 2,
              artworkCenterY - drawHeight / 2,
              drawWidth,
              drawHeight
            );
          }
        }
      } catch {
        // Keep artwork area clean if loading fails.
      } finally {
        clearTimeout(timeout);
      }
    }

    // Pokémon name
    const name = String(
      card.pokemon_name || 'Unknown Pokémon'
    );

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    fitFont(
      name,
      cardWidth - 30,
      23,
      14,
      700
    );

    ctx.fillStyle = '#F1F5FF';

    ctx.fillText(
      name,
      centerX,
      y + 254,
      cardWidth - 30
    );

    // Pokémon type indicator
    const types = getTypes(card);

    const typeLabel = types.length
      ? types.map(type => String(type).toUpperCase()).join(' / ')
      : 'UNKNOWN TYPE';

    ctx.font = '700 10px sans-serif';

    const typeWidth = Math.min(
      cardWidth - 40,
      Math.max(
        100,
        ctx.measureText(typeLabel).width + 28
      )
    );

    fillRounded(
      centerX - typeWidth / 2,
      y + 274,
      typeWidth,
      23,
      8,
      rgba(pokemonColor, 0.15)
    );

    ctx.fillStyle = '#C4D5F0';

    ctx.fillText(
      typeLabel,
      centerX,
      y + 286,
      typeWidth - 12
    );

    // Divider
    ctx.beginPath();

    ctx.moveTo(
      x + 18,
      y + 307
    );

    ctx.lineTo(
      x + cardWidth - 18,
      y + 307
    );

    ctx.strokeStyle = 'rgba(160, 179, 210, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Generation and Pokédex information
    ctx.textAlign = 'left';
    ctx.font = '500 11px sans-serif';
    ctx.fillStyle = '#8798B5';

    const speciesNumber = String(
      card.species_id || '?'
    ).padStart(3, '0');

    ctx.fillText(
      `#${speciesNumber}  ·  GEN ${card.generation || '?'}`,
      x + 19,
      y + 322
    );

    // Card ID
    ctx.textAlign = 'right';
    ctx.fillStyle = '#A9B9D3';

    ctx.fillText(
      `ID: ${card.card_id || '?'}`,
      x + cardWidth - 19,
      y + 322
    );
  };

  // --------------------------------------------------
  // RENDER ALL EIGHT POSITIONS
  // --------------------------------------------------

  await Promise.all(
    Array.from({ length: 8 }, async (_, index) => {
      const card = visibleCards[index];

      const column = index % columns;
      const row = Math.floor(index / columns);

      const x = margin + column * (cardWidth + gap);
      const y = startY + row * (cardHeight + gap);

      if (card) {
        await drawPokemon(card, index);
      } else {
        drawEmptySlot(x, y, index);
      }
    })
  );

  // --------------------------------------------------
  // EXPORT PNG
  // --------------------------------------------------

  return new AttachmentBuilder(
    canvas.toBuffer('image/png'),
    {
      name: 'pokemon-collection.png',
    }
  );
}

// ======================================================
// COLLECTION CARD EMBEDS
// ======================================================

function buildCollectionCardEmbeds(cards) {
  return cards.map((card, index) => {
    const info = rarityInfo(card.rarity);
    const types = getTypes(card);

    const typeLabel = types.length
      ? types.join(' / ')
      : 'Type unavailable';

    const embed = new EmbedBuilder()
      .setColor(getPokemonColor(card, info.color))
      .setTitle(
        `${index + 1}. ${emoji('pokemon', '◈')}${card.pokemon_name || 'Unknown Pokémon'}`
      )
      .setDescription(
        `${info.label} • ${typeLabel} • Gen ${card.generation || '?'}\nCard ID: \`${card.card_id}\` • Pokédex: #${String(card.species_id || '').padStart(3, '0')}`
      );

    if (card.artwork_url) {
      embed.setImage(card.artwork_url);
    }

    return embed;
  });
}

// ======================================================
// SIMPLE EMBED
// ======================================================

function buildSimpleEmbed(title, description, color = THEME) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

// ======================================================
// EXPORTS
// ======================================================

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
