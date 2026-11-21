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
  normal: 0xA8A878, fire: 0xF08030, water: 0x6890F0, electric: 0xF8D030,
  grass: 0x78C850, ice: 0x98D8D8, fighting: 0xC03028, poison: 0xA040A0,
  ground: 0xE0C068, flying: 0xA890F0, psychic: 0xF85888, bug: 0xA8B820,
  rock: 0xB8A038, ghost: 0x705898, dragon: 0x7038F8, dark: 0x705848,
  steel: 0xB8B8D0, fairy: 0xEE99AC,
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
  const colors = getTypes(card)
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

  return (Math.round(average.r) << 16) |
    (Math.round(average.g) << 8) |
    Math.round(average.b);
}

function buildCardEmbed(card, index = 0, total = 1, counts = null) {
  const info = rarityInfo(card.rarity);
  const types = getTypes(card);
  const typeLabel = types.length
    ? types.map(type => type.charAt(0).toUpperCase() + type.slice(1)).join(' / ')
    : 'Unknown';
  const name = card.pokemon_name || card.name || 'Unknown Pokémon';

  const isShiny = Number(card.is_shiny) === 1;
  const embed = new EmbedBuilder()
    .setColor(isShiny ? 0xE5B93D : getPokemonColor(card, info.color))
    .setTitle(`${isShiny ? '✨ ' : ''}${emoji('pokemon', '◈')}${name}`)
    .setDescription(`**${info.label} Pokémon Card**${isShiny ? '  ·  ✨ **SHINY**' : ''}  ·  ${typeLabel} type`)
    .addFields(
      { name: 'Card ID', value: `\`${card.card_id}\``, inline: true },
      { name: 'Generation', value: `Gen ${card.generation || '?'}`, inline: true },
      { name: 'Pokédex', value: `#${String(card.species_id || '').padStart(3, '0')}`, inline: true },
    )
    .setFooter({
      text: `Card ${index + 1} / ${total}${counts ? `  ·  ${counts.common} Common  ·  ${counts.rare} Rare  ·  ${counts.mythical} Mythical` : ''}`,
    })
    .setTimestamp();

  if (card.artwork_url) embed.setImage(card.artwork_url);
  return embed;
}

function buildPackButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pokemon:pack:${sessionId}:prev`).setLabel('‹').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`pokemon:pack:${sessionId}:next`).setLabel('›').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`pokemon:pack:${sessionId}:close`).setLabel('Close').setStyle(ButtonStyle.Secondary),
  );
}

function buildBrowseButtons(sessionId, page, pages) {
  const current = Math.max(1, Number(page) || 1);
  const total = Math.max(1, Number(pages) || 1);
  const atStart = current <= 1;
  const atEnd = current >= total;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pokemon:browse:${sessionId}:first`).setLabel('≪').setStyle(ButtonStyle.Secondary).setDisabled(atStart),
    new ButtonBuilder().setCustomId(`pokemon:browse:${sessionId}:prev`).setLabel('‹').setStyle(ButtonStyle.Secondary).setDisabled(atStart),
    new ButtonBuilder().setCustomId(`pokemon:browse:${sessionId}:page`).setLabel(`${current} / ${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`pokemon:browse:${sessionId}:next`).setLabel('›').setStyle(ButtonStyle.Secondary).setDisabled(atEnd),
    new ButtonBuilder().setCustomId(`pokemon:browse:${sessionId}:last`).setLabel('≫').setStyle(ButtonStyle.Secondary).setDisabled(atEnd),
  );
}

function buildFilteredInventoryButtons(sessionId, page, pages) {
  const current = Math.max(1, Number(page) || 1);
  const total = Math.max(1, Number(pages) || 1);
  const atStart = current <= 1;
  const atEnd = current >= total;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pokemon:invfilter:${sessionId}:first`).setLabel('≪').setStyle(ButtonStyle.Secondary).setDisabled(atStart),
    new ButtonBuilder().setCustomId(`pokemon:invfilter:${sessionId}:prev`).setLabel('‹').setStyle(ButtonStyle.Secondary).setDisabled(atStart),
    new ButtonBuilder().setCustomId(`pokemon:invfilter:${sessionId}:page`).setLabel(`${current} / ${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`pokemon:invfilter:${sessionId}:next`).setLabel('›').setStyle(ButtonStyle.Secondary).setDisabled(atEnd),
    new ButtonBuilder().setCustomId(`pokemon:invfilter:${sessionId}:last`).setLabel('≫').setStyle(ButtonStyle.Secondary).setDisabled(atEnd),
  );
}

function buildResetButtons(token) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pokemon:reset:${token}:confirm`).setLabel('Reset my Pokémon data').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`pokemon:reset:${token}:cancel`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
}

function buildInventoryEmbed(result, title, rarity = null, avatarURL = null, filters = {}) {
  const lines = (result.cards || []).map(card => {
    const info = rarityInfo(card.rarity);
    const types = getTypes(card);
    const typeLabel = types.length ? types.join(' / ') : 'Type unavailable';
    return `${emoji('pokemon', '◈')} **${card.pokemon_name || 'Unknown Pokémon'}**${Number(card.is_shiny) === 1 ? '  ·  ✨ **SHINY**' : ''}  ·  ${info.label}\n${typeLabel}  ·  Gen ${card.generation || '?'}\nID: \`${card.card_id}\``;
  });

  const activeFilters = [];
  if (filters.rarity) activeFilters.push(`${rarityInfo(filters.rarity).label}`);
  if (filters.type) activeFilters.push(`${filters.type[0].toUpperCase()}${filters.type.slice(1)} type`);
  if (filters.generation) activeFilters.push(`Gen ${filters.generation}`);
  if (filters.shiny) activeFilters.push('Shiny cards');
  if (filters.search) activeFilters.push(`Name: ${filters.search}`);

  const embed = new EmbedBuilder()
    .setColor(THEME)
    .setTitle(title || 'Your Pokémon Inventory')
    .setDescription([
      activeFilters.length ? `**Filters:** ${activeFilters.join('  ·  ')}` : '**Your collected cards**',
      '',
      lines.length ? lines.join('\n\n') : 'No cards match these filters.',
    ].join('\n'))
    .setFooter({
      text: `Page ${result.page}/${result.pages}  ·  ${result.total} card(s)${rarity && !activeFilters.length ? `  ·  ${rarityInfo(rarity).label}` : ''}`,
    })
    .setTimestamp();

  if (avatarURL) embed.setThumbnail(avatarURL);
  return embed;
}

function buildPokedexEmbed(result, generation = null) {
  const lines = (result.rows || []).map(row =>
    `${emoji(row.discovered ? 'discovered' : 'undiscovered', row.discovered ? '●' : '○')}${emoji('pokemon', '◈')} **#${String(row.species_id).padStart(3, '0')} ${row.name}**  ·  ${emoji(row.rarity)}${rarityInfo(row.rarity).label}`
  );
  const percentage = result.total ? ((result.found / result.total) * 100).toFixed(1) : '0.0';

  return new EmbedBuilder()
    .setColor(THEME)
    .setTitle(`Pokédex${generation ? `  ·  Generation ${generation}` : ''}`)
    .setDescription(`**${result.found}/${result.total} discovered (${percentage}%)**\n\n${lines.join('\n') || 'No species found.'}`)
    .setFooter({ text: `Page ${result.page}/${result.pages}  ·  Discoveries count once; duplicates do not increase progress.` })
    .setTimestamp();
}

function buildCollectionSummary(collection, cards, ownerLabel) {
  const embed = new EmbedBuilder()
    .setColor(collection.hex_color || THEME)
    .setTitle(`${emoji('collection', '')}${collection.name}`)
    .setDescription(`A collection by **${ownerLabel || 'Collector'}**  ·  **${cards.length}/8 cards**`)
    .setFooter({ text: 'Each card can belong to one collection at a time.' })
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
    const typeLabel = types.length ? types.join(' / ') : 'Type unavailable';
    const artwork = card.artwork_url ? `  ·  [Artwork](${card.artwork_url})` : '';
    return `${emoji('pokemon', '◈')} **${index + 1}. ${card.pokemon_name || 'Unknown Pokémon'}**${Number(card.is_shiny) === 1 ? '  ·  ✨ **SHINY**' : ''}\n${info.label}  ·  ${typeLabel}  ·  Gen ${card.generation || '?'}\nID: \`${card.card_id}\`${artwork}`;
  };

  const left = cards.filter((_card, index) => index % 2 === 0)
    .map((card, index) => renderCard(card, index * 2));
  const right = cards.filter((_card, index) => index % 2 === 1)
    .map((card, index) => renderCard(card, index * 2 + 1));

  embed.addFields(
    { name: 'Collection  /  I', value: left.join('\n\n').slice(0, 1024) || '\u200b', inline: true },
    { name: 'Collection  /  II', value: right.join('\n\n').slice(0, 1024) || '\u200b', inline: true },
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
  const rows = 2;
  const width = 1200;
  const height = 660;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const slotWidth = width / columns;
  const rowHeight = height / rows;

  const drawPokemon = async (card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const centerX = column * slotWidth + slotWidth / 2;
    const rowTop = row * rowHeight;
    const artworkCenterY = rowTop + 135;

    if (card.artwork_url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      try {
        const response = await fetch(card.artwork_url, { signal: controller.signal });
        if (response.ok) {
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 0 && bytes.length <= 5 * 1024 * 1024) {
            const image = await loadImage(bytes);
            const scale = Math.min(230 / image.width, 230 / image.height, 1);
            const drawWidth = image.width * scale;
            const drawHeight = image.height * scale;
            ctx.drawImage(image, centerX - drawWidth / 2, artworkCenterY - drawHeight / 2, drawWidth, drawHeight);
          }
        }
      } catch {
        // A failed artwork request leaves the slot transparent.
      } finally {
        clearTimeout(timeout);
      }
    }

    const name = String(card.pokemon_name || 'Unknown Pokémon');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontSize = 22;
    do {
      ctx.font = `700 ${fontSize}px sans-serif`;
      if (ctx.measureText(name).width <= slotWidth - 28) break;
      fontSize--;
    } while (fontSize > 14);
    const labelY = rowTop + 278;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20, 27, 39, 0.82)';
    ctx.strokeText(name, centerX, labelY, slotWidth - 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, centerX, labelY, slotWidth - 30);

    const details = `${rarityInfo(card.rarity).label}${Number(card.is_shiny) === 1 ? '  ·  SHINY' : ''}  ·  Gen ${card.generation || '?'}`;
    ctx.font = '500 14px sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20, 27, 39, 0.78)';
    ctx.strokeText(details, centerX, labelY + 27, slotWidth - 32);
    ctx.fillStyle = '#E6EAF0';
    ctx.fillText(details, centerX, labelY + 27, slotWidth - 32);
  };

  await Promise.all(cards.slice(0, 8).map(drawPokemon));
  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'pokemon-collection.png' });
}

function buildCollectionCardEmbeds(cards) {
  return cards.map((card, index) => {
    const info = rarityInfo(card.rarity);
    const types = getTypes(card);
    const typeLabel = types.length ? types.join(' / ') : 'Type unavailable';
    const isShiny = Number(card.is_shiny) === 1;
    const embed = new EmbedBuilder()
      .setColor(isShiny ? 0xE5B93D : getPokemonColor(card, info.color))
      .setTitle(`${index + 1}. ${isShiny ? '✨ ' : ''}${emoji('pokemon', '◈')}${card.pokemon_name || 'Unknown Pokémon'}`)
      .setDescription(`${info.label}${isShiny ? '  ·  ✨ **SHINY**' : ''}  ·  ${typeLabel}  ·  Gen ${card.generation || '?'}\nCard ID: \`${card.card_id}\`  ·  Pokédex: #${String(card.species_id || '').padStart(3, '0')}`);
    if (card.artwork_url) embed.setImage(card.artwork_url);
    return embed;
  });
}

function buildProfileEmbed(user, stats, packBalances, serverName = 'This server') {
  const avatar = user?.displayAvatarURL?.({ size: 256 });
  const username = user?.username || 'PokéPack Collector';
  const discovered = Number(stats.unique_discovered || 0);
  const dexPercent = Math.min(100, (discovered / 1025) * 100);
  const joinedAt = Number(stats.created_at || 0);
  const joinedText = joinedAt > 0 ? `<t:${Math.floor(joinedAt / 1000)}:D>` : 'Unknown';

  const embed = new EmbedBuilder()
    .setColor(THEME)
    .setAuthor({
      name: 'POKÉPACK  /  COLLECTOR PROFILE',
      ...(avatar ? { iconURL: avatar } : {}),
    })
    .setTitle(`${username}'s Collection`)
    .setDescription([
      `Collector since **${joinedText}**`,
      `Pokédex progress  ·  **${discovered.toLocaleString('en-US')}/1,025**  (${dexPercent.toFixed(1)}%)`,
    ].join('\n'))
    .addFields(
      {
        name: 'COLLECTION OVERVIEW',
        value: [
          `**${Number(stats.cards_owned || 0).toLocaleString('en-US')}** cards owned`,
          `**${Number(stats.unique_discovered || 0).toLocaleString('en-US')}** unique Pokémon`,
          `**${Number(stats.collections || 0).toLocaleString('en-US')}** collections created`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'CARD RARITY',
        value: [
          `Common  ·  **${Number(stats.common_cards || 0).toLocaleString('en-US')}**`,
          `Rare  ·  **${Number(stats.rare_cards || 0).toLocaleString('en-US')}**`,
          `Mythical  ·  **${Number(stats.mythical_cards || 0).toLocaleString('en-US')}**`,
          `✨ Shiny cards  ·  **${Number(stats.shiny_cards || 0).toLocaleString('en-US')}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'PACK INVENTORY',
        value: [
          `Common Packs  ·  **${Number(packBalances?.common || 0).toLocaleString('en-US')}**`,
          `Rare Packs  ·  **${Number(packBalances?.rare || 0).toLocaleString('en-US')}**`,
          `Mythical Packs  ·  **${Number(packBalances?.mythical || 0).toLocaleString('en-US')}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'COLLECTOR RECORD',
        value: [
          `Packs opened  ·  **${Number(stats.packs_opened || 0).toLocaleString('en-US')}**`,
          `Cards burned  ·  **${Number(stats.cards_burned || 0).toLocaleString('en-US')}**`,
          `Cards gifted  ·  **${Number(stats.cards_gifted || 0).toLocaleString('en-US')}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'RECENT CARDS IN COLLECTION',
        value: (Array.isArray(stats.recent_cards) && stats.recent_cards.length)
          ? stats.recent_cards.map(card => {
              const name = String(card.pokemon_name || 'Unknown Pokémon');
              const artwork = card.artwork_url ? `[${name}](${card.artwork_url})` : `**${name}**`;
              const shiny = Number(card.is_shiny) === 1 ? '  ·  ✨ Shiny' : '';
              return `${artwork}  ·  ${rarityInfo(card.rarity).label}${shiny}  ·  \`${card.card_id}\``;
            }).join('\n')
          : 'No cards collected yet.',
        inline: false,
      },
    )
    .setFooter({ text: `${serverName}  ·  Shiny status is separate from card rarity` })
    .setTimestamp();

  if (avatar) embed.setThumbnail(avatar);
  return embed;
}

async function buildProfileImage(user, stats, packBalances, serverName = 'This server') {
  let canvasModule;
  try {
    canvasModule = require('@napi-rs/canvas');
  } catch {
    return null;
  }

  const { createCanvas, loadImage } = canvasModule;
  const width = 1600;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const roundedRect = (x, y, w, h, radius, fill, stroke = null, lineWidth = 1) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  };
  const text = (value, x, y, size, color = '#E8EDF7', weight = 600, align = 'left') => {
    ctx.font = `${weight} ${size}px sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(String(value), x, y);
  };
  const number = value => Number(value || 0).toLocaleString('en-US');
  const loadRemote = async url => {
    if (!url) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) return null;
      return await loadImage(bytes);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#111827');
  bg.addColorStop(0.55, '#1B2335');
  bg.addColorStop(1, '#101522');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = i % 2 ? '#60A5FA' : '#A78BFA';
    ctx.beginPath();
    ctx.arc((i * 173) % width, (i * 97) % height, 90 + (i % 4) * 24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Header / trainer identity
  roundedRect(34, 30, 1532, 190, 28, '#252D40', '#59647C', 3);
  roundedRect(56, 50, 140, 140, 22, '#111827', '#65738E', 2);
  const avatarUrl = user?.displayAvatarURL?.({ extension: 'png', size: 256 });
  const avatar = await loadRemote(avatarUrl);
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(66, 60, 120, 120, 18);
    ctx.clip();
    ctx.drawImage(avatar, 66, 60, 120, 120);
    ctx.restore();
  } else {
    text(String(user?.username || 'P').slice(0, 1).toUpperCase(), 126, 120, 64, '#60A5FA', 800, 'center');
  }
  text('POKÉPACK COLLECTOR', 224, 78, 30, '#B8C4D9', 700);
  text(user?.username || 'Collector', 224, 126, 54, '#F4F7FF', 800);
  text(`${serverName}  ·  Collector profile`, 224, 177, 24, '#8FA0BC', 500);

  // Main stat panels
  const panelY = 250;
  const panelH = 380;
  roundedRect(34, panelY, 950, panelH, 26, '#20283A', '#59647C', 3);
  roundedRect(1010, panelY, 556, panelH, 26, '#20283A', '#59647C', 3);
  text('COLLECTION STATS', 64, 292, 30, '#FBBF24', 800);

  const cardsOwned = Number(stats.cards_owned || 0);
  const unique = Number(stats.unique_discovered || 0);
  const dexPct = Math.min(100, unique / 1025 * 100);
  const statItems = [
    ['PACKS OPENED', number(stats.packs_opened), '#60A5FA'],
    ['CARDS OWNED', number(cardsOwned), '#FBBF24'],
    ['UNIQUE POKÉMON', number(unique), '#34D399'],
    ['SHINY CARDS', number(stats.shiny_cards), '#F0C75E'],
    ['COMMON', number(stats.common_cards), '#9CA3AF'],
    ['RARE', number(stats.rare_cards), '#60A5FA'],
    ['MYTHICAL', number(stats.mythical_cards), '#C084FC'],
    ['COLLECTIONS', number(stats.collections), '#F472B6'],
  ];
  const statW = 410;
  const statH = 104;
  statItems.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 64 + col * 450;
    const y = 328 + row * 128;
    roundedRect(x, y, statW, statH, 18, '#151D2C', '#3B465C', 2);
    roundedRect(x, y, 8, statH, 4, item[2]);
    text(item[0], x + 28, y + 32, 21, '#9EACC5', 700);
    text(item[1], x + 28, y + 72, 36, '#F4F7FF', 800);
  });

  // Pokédex progress and pack balances
  text('POKÉDEX', 1040, 292, 30, '#FBBF24', 800);
  text(`${number(unique)} / 1,025`, 1040, 344, 36, '#F4F7FF', 800);
  roundedRect(1040, 370, 490, 20, 10, '#111827');
  roundedRect(1040, 370, 490 * dexPct / 100, 20, 10, '#60A5FA');
  text(`${dexPct.toFixed(1)}% COMPLETE`, 1040, 410, 20, '#9EACC5', 700);
  text('PACK INVENTORY', 1040, 466, 28, '#FBBF24', 800);
  const packs = [
    ['COMMON', number(packBalances?.common), '#60A5FA'],
    ['RARE', number(packBalances?.rare), '#FBBF24'],
    ['MYTHICAL', number(packBalances?.mythical), '#C084FC'],
  ];
  packs.forEach((pack, i) => {
    const x = 1040 + i * 160;
    roundedRect(x, 490, 145, 94, 16, '#151D2C', '#3B465C', 2);
    text(pack[0], x + 14, 520, 17, pack[2], 700);
    text(pack[1], x + 14, 555, 30, '#F4F7FF', 800);
  });

  // Display three most recently acquired cards
  text('RECENTLY COLLECTED', 64, 690, 30, '#FBBF24', 800);
  const recent = Array.isArray(stats.recent_cards) ? stats.recent_cards.slice(0, 3) : [];
  const cardW = 480;
  const cardH = 170;
  for (let i = 0; i < 3; i++) {
    const x = 34 + i * 515;
    roundedRect(x, 718, cardW, cardH, 22, '#20283A', '#59647C', 3);
    const card = recent[i];
    if (!card) {
      text('No cards collected yet', x + cardW / 2, 802, 24, '#8FA0BC', 600, 'center');
      continue;
    }
    const artwork = await loadRemote(card.artwork_url);
    if (artwork) {
      const scale = Math.min(126 / artwork.width, 126 / artwork.height);
      const dw = artwork.width * scale;
      const dh = artwork.height * scale;
      ctx.drawImage(artwork, x + 22 + (126 - dw) / 2, 738 + (126 - dh) / 2, dw, dh);
    }
    const shiny = Number(card.is_shiny) === 1;
    text(`${shiny ? '✨ ' : ''}${card.pokemon_name || 'Unknown Pokémon'}`, x + 168, 766, 27, shiny ? '#F6D365' : '#F4F7FF', 800);
    text(rarityInfo(card.rarity).label.toUpperCase(), x + 168, 810, 20, rarityInfo(card.rarity).color.toString(16).padStart(6, '0').replace(/^/, '#'), 700);
    text(`CARD #${card.card_id}`, x + 168, 850, 18, '#9EACC5', 600);
  }
  text('POKÉPACK  ·  LIVE COLLECTION DATA', 1560, 878, 18, '#77869F', 600, 'right');

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'pokemon-profile.png' });
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
  buildFilteredInventoryButtons,
  buildResetButtons,
  buildInventoryEmbed,
  buildPokedexEmbed,
  buildCollectionSummary,
  buildCollectionGallery,
  buildCollectionCardEmbeds,
  buildProfileEmbed,
  buildProfileImage,
  buildSimpleEmbed,
};
