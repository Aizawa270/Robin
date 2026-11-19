'use strict';

// ============================================================
// POKÉMON CUSTOM ICONS
// Custom Discord emojis used throughout the Pokémon system.
// ============================================================

const EMOJIS = {
  // Main Pokédex/card markers
  pokemon: '<:pokeball:1572961045683769404>',
  discovered: '<:search:1572961460336730213>',
  undiscovered: '<:undiscoveredcard:1572964774554370048>',

  // Rarity markers
  common: '<:common:1572963631870771340>',
  rare: '<:rare:1572963564535291984>',
  mythical: '<:mythical:1572963048929628254>',

  // Pack balance labels
  pack_common: '<:commonpack:1572963934527430707>',
  pack_rare: '<:rarepack:1572963855649218570>',
  pack_mythical: '<:mythicpack:1572964462590304386>',

  // Other system markers
  card: '<:card:1572964036595683348>',
  collection: '<:pokedex:1572961360021815366>',
  gift: '<:gift:1572964282164060251>',
  daily: '<:daily:1572964669101179011>',
  quest: '<:quest:1572964904590246091>',
  quest_ready: '<:questcomplete:1572964109270523924>',
};

function emoji(key, fallback = '') {
  const name = String(key);
  const hasCustomValue = Object.prototype.hasOwnProperty.call(EMOJIS, name);
  const value = String(hasCustomValue ? (EMOJIS[name] || '') : (fallback || '')).trim();
  return value ? `${value} ` : '';
}

module.exports = { EMOJIS, emoji };