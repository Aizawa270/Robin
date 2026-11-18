'use strict';

// ============================================================
// POKÉMON CUSTOM ICONS
// Paste custom Discord emojis between the quotes, for example:
// pokemon: '<:pokeball:123456789012345678>',
//
// Leave a value as '' to hide that icon. The bot must be in a server
// that can use the emoji (or have the required external emoji access).
// These keys are used by Pokédex, packs, quests, cards and collection embeds.
// ============================================================

const EMOJIS = {
  // Main Pokédex/card markers
  pokemon: '◈',
  discovered: '●',
  undiscovered: '○',

  // Rarity markers
  common: '',
  rare: '',
  mythical: '',

  // Pack balance labels
  pack_common: '',
  pack_rare: '',
  pack_mythical: '',

  // Other system markers
  card: '',
  collection: '',
  gift: '',
  daily: '',
  quest: '',
  quest_ready: '',
};

function emoji(key, fallback = '') {
  const name = String(key);
  const hasCustomValue = Object.prototype.hasOwnProperty.call(EMOJIS, name);
  const value = String(hasCustomValue ? (EMOJIS[name] || '') : (fallback || '')).trim();
  return value ? `${value} ` : '';
}

module.exports = { EMOJIS, emoji };
