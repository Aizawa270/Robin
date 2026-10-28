// ============================================================
// FARM EMOJIS
// Paste your custom emojis between the quotes, like your Crowns emoji:
//   wheat: '<:wheat:123456789012345678>',
// Leave '' for no emoji. The bot must be in the server that owns the emoji.
//
// A crop's emoji is used for its seeds AND its produce.
// To give seeds a different icon, fill in the optional seed_<crop> line.
// ============================================================

const EMOJIS = {
  // ---- Crops: Beginner ----
  wheat: '<:wheat:1565028832862277713>',
  carrot: '<:carrot:1565028892484567201>',
  potato: '<:potato:1565028962122465441>',
  lettuce: '<:lettuce:1565029040400765048>',

  // ---- Crops: Intermediate ----
  tomato: '<:tomato:1565029111129448488>',
  corn: '<:corn:1565029179655717004>',
  strawberry: '<:strawberry:1565029242549571584>',
  onion: '<:onion:1565029320022425730>',

  // ---- Crops: Advanced ----
  grapes: '<:grapes:1565029382790324444>',
  watermelon: '<:watermelon:1565029433264308338>',
  pumpkin: '<:pumpkin:1565029500461518879>',
  blueberry: '<:blueberry:1565029553141846066>',

  // ---- Crops: Rare ----
  golden_wheat: '',
  moonberry: '',
  crystal_corn: '',
  dragonfruit: '',

  // ---- Optional separate seed icons (falls back to the crop emoji) ----
  seed_wheat: '',
  seed_carrot: '',
  seed_potato: '',
  seed_lettuce: '',
  seed_tomato: '',
  seed_corn: '',
  seed_strawberry: '',
  seed_onion: '',
  seed_grapes: '',
  seed_watermelon: '',
  seed_pumpkin: '',
  seed_blueberry: '',
  seed_golden_wheat: '',
  seed_moonberry: '',
  seed_crystal_corn: '',
  seed_dragonfruit: '',

  // ---- Supplies ----
  fert_basic: '',
  fert_advanced: '',
  fert_premium: '',

  // ---- Tools ----
  can_basic: '',
  can_copper: '',
  can_golden: '',
  hoe_wooden: '',
  hoe_iron: '',
  hoe_golden: '',

  // ---- Decorations ----
  decor_fence: '',
  decor_scarecrow: '',
  decor_windmill: '',
  decor_fountain: '',
  decor_farmhouse: '',
  decor_greenhouse: '',
};

// Returns "<emoji> " (with a trailing space) or '' when none is set.
function emoji(key) {
  const value = EMOJIS[key];
  return value ? `${value} ` : '';
}

// Seed icon for a crop id, falling back to the crop emoji.
function seedEmoji(cropId) {
  return emoji(`seed_${cropId}`) || emoji(cropId);
}

module.exports = { EMOJIS, emoji, seedEmoji };
