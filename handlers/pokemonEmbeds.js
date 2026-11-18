'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    .setDescription(`**${info.label} Pokémon Card**
${typeLabel} type`)
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
      .setLabel('←')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pokemon:pack:${sessionId}:next`)
      .setLabel('→')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pokemon:pack:${sessionId}:close`)
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildCollectionSummary(collection, cards, ownerLabel) {
  const lines = cards.length
    ? cards.map((card, index) => `${index + 1}. ${emoji('pokemon', '◈')}**${card.pokemon_name || 'Unknown Pokémon'}** • ${card.rarity || 'common'} • Gen ${card.generation || '?'}`).join('\n')
    : 'No Pokémon have been added yet. Use `$p add <card ID> <collection name>` to add one.';

  return new EmbedBuilder()
    .setColor(collection.hex_color || THEME)
    .setTitle(`${emoji('collection', '')}${collection.name}`)
    .setDescription(`**${cards.length}/8 cards** • ${ownerLabel || 'Collection'}\n\n${lines}`)
    .setFooter({ text: 'A card can only belong to one collection at a time.' })
    .setTimestamp();
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
  buildCollectionSummary,
  buildCollectionCardEmbeds,
  buildSimpleEmbed,
};
