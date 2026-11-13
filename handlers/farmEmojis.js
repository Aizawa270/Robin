
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
  golden_wheat: '<:golden_wheat:1565031647059910757>',
  moonberry: '<:moonberry:1565031484954386633>',
  crystal_corn: '<:crystal_corn:1565032008084885616>',
  dragonfruit: '<:dragonfruit:1565032091916312666>',

  // ---- Optional separate seed icons ----
  seed_wheat: '<:wheet_seed:1567939400078200832>',
  seed_carrot: '<:carrots_seed:1565072364717215825>',
  seed_potato: '<:potato_seed:1565072695283032125>',
  seed_lettuce: '<:lettuce_seed:1565072589200826449>',
  seed_tomato: '<:tomato_seed:1567939276749152279>',
  seed_corn: '<:Corn_seed:1565072400792686754>',
  seed_strawberry: '<:Strawberry_seed:1567939334726754364>',
  seed_onion: '<:Onion_seed:1565072651867656333>',
  seed_grapes: '<:Grapes_seed:1565072553226018907>',
  seed_watermelon: '<:watermelon_seed:1567939360974708927>',
  seed_pumpkin: '<:Pumpkin_seed:1567939314405613728>',
  seed_blueberry: '<:blueberry_seed:1565072319418732826>',
  seed_golden_wheat: '<:Golden_wheat_seed:1565072516404478023>',
  seed_moonberry: '<:Moonberry_seed:1565072622482620619>',
  seed_crystal_corn: '<:crystal_corn_seed:1565072434783330514>',
  seed_dragonfruit: '<:dragonfruit_seed:1565072469067440201>',

  // ---- Supplies ----
  fert_basic: '<:fert_basic:1565032841761525893>',
  fert_advanced: '<:fert_advanced:1565032886330200264>',
  fert_premium: '<:fert_premium:1565032941392760842>',

  // ---- Tools ----
  can_basic: '<:can_basic:1565034209465204746>',
  can_copper: '<:can_copper:1565044568456695829>',
  can_golden: '<:can_golden:1565044628649021580>',
  hoe_wooden: '<:hoe_wooden:1565044802956038276>',
  hoe_iron: '<:hoe_iron:1565044851974602772>',
  hoe_golden: '<:hoe_golden:1565044898913329253>',

  // ---- Decorations ----
  decor_fence: '<:fence:1567939925930807386>',
  decor_scarecrow: '<:scarecrow:1567939959988686948>',
  decor_windmill: '<:windmill:1567940049113456752>',
  decor_fountain: '<:fountain:1567940131443310733>',
  decor_farmhouse: '<:farmhouse:1567940183566057543>',
  decor_greenhouse: '<:greenhouse:1567940251245224036>',
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
