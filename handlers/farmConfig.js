// ============================================================
// FARM CONFIG
// Every price, time and reward lives here so the economy can be
// balanced after testing. Money values are in Crowns.
//
// Rebalanced for an inflated economy: cheapest item 1,000,
// most expensive seed 50,000, nothing above 1,000,000.
// ============================================================

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

module.exports = {
  // ---------- General ----------
  STARTING_GRANT: 5000,        // one-time Crowns when a player first opens a farm (0 = off)
  START_SEEDS: { wheat: 5, carrot: 3 },
  MAX_LEVEL: 60,
  COMMAND_COOLDOWN_MS: 1200,   // per-player rate limit between farm commands
  MAX_BUY_PER_ORDER: 1000,
  MIN_GROW_MS: 30 * 1000,

  // XP needed to go from `level` to `level + 1`.
  xpToNext: level => Math.round(80 * Math.pow(level, 1.45)),

  // ---------- Titles (highest level reached is shown) ----------
  TITLES: [
    { level: 1, name: 'Seedling' },
    { level: 5, name: 'Farmhand' },
    { level: 10, name: 'Grower' },
    { level: 15, name: 'Harvester' },
    { level: 20, name: 'Agronomist' },
    { level: 30, name: 'Master Farmer' },
    { level: 45, name: 'Estate Lord' },
    { level: 60, name: 'Legend of the Land' },
  ],

  // ---------- Crops ----------
  // growMs: growth time | yield: [min, max] units per plot | price: base sell price per unit
  // xp: farming XP per plot harvested | berry: affected by Pollination Season
  CROPS: [
    // Beginner (seeds 1,000 - 1,800)
    { id: 'wheat', name: 'Wheat', tier: 'Beginner', level: 1, seedCost: 1000, growMs: 30 * MIN, yield: [3, 5], price: 400, xp: 8 },
    { id: 'carrot', name: 'Carrots', tier: 'Beginner', level: 1, seedCost: 1500, growMs: 1 * HOUR, yield: [3, 5], price: 600, xp: 12 },
    { id: 'potato', name: 'Potatoes', tier: 'Beginner', level: 1, seedCost: 1800, growMs: 90 * MIN, yield: [4, 6], price: 560, xp: 15 },
    { id: 'lettuce', name: 'Lettuce', tier: 'Beginner', level: 1, seedCost: 1200, growMs: 45 * MIN, yield: [3, 5], price: 440, xp: 10 },
    // Intermediate (seeds 3,000 - 6,000)
    { id: 'tomato', name: 'Tomatoes', tier: 'Intermediate', level: 5, seedCost: 3500, growMs: 3 * HOUR, yield: [4, 7], price: 980, xp: 30 },
    { id: 'corn', name: 'Corn', tier: 'Intermediate', level: 5, seedCost: 4200, growMs: 4 * HOUR, yield: [5, 8], price: 910, xp: 36 },
    { id: 'strawberry', name: 'Strawberries', tier: 'Intermediate', level: 5, seedCost: 6000, growMs: 5 * HOUR, yield: [4, 7], price: 1800, xp: 45, berry: true },
    { id: 'onion', name: 'Onions', tier: 'Intermediate', level: 5, seedCost: 3000, growMs: 150 * MIN, yield: [4, 6], price: 800, xp: 26 },
    // Advanced (seeds 8,000 - 15,000)
    { id: 'grapes', name: 'Grapes', tier: 'Advanced', level: 10, seedCost: 8000, growMs: 8 * HOUR, yield: [5, 8], price: 1870, xp: 70 },
    { id: 'watermelon', name: 'Watermelons', tier: 'Advanced', level: 10, seedCost: 12000, growMs: 10 * HOUR, yield: [4, 6], price: 3240, xp: 85 },
    { id: 'pumpkin', name: 'Pumpkins', tier: 'Advanced', level: 10, seedCost: 10000, growMs: 12 * HOUR, yield: [5, 7], price: 2230, xp: 80 },
    { id: 'blueberry', name: 'Blueberries', tier: 'Advanced', level: 10, seedCost: 15000, growMs: 8 * HOUR, yield: [6, 9], price: 2670, xp: 90, berry: true },
    // Rare (seeds 25,000 - 50,000)
    { id: 'golden_wheat', name: 'Golden Wheat', tier: 'Rare', level: 20, seedCost: 25000, growMs: 12 * HOUR, yield: [4, 6], price: 9000, xp: 150 },
    { id: 'moonberry', name: 'Moonberries', tier: 'Rare', level: 20, seedCost: 32000, growMs: 18 * HOUR, yield: [4, 6], price: 11500, xp: 200, berry: true },
    { id: 'crystal_corn', name: 'Crystal Corn', tier: 'Rare', level: 20, seedCost: 40000, growMs: 24 * HOUR, yield: [5, 7], price: 12500, xp: 250 },
    { id: 'dragonfruit', name: 'Dragonfruit', tier: 'Rare', level: 20, seedCost: 50000, growMs: 24 * HOUR, yield: [5, 7], price: 17000, xp: 300 },
  ],

  // ---------- Tools (permanent, replace the previous tier) ----------
  // Watering cans speed up growth when planting (bonus = fraction faster, max 0.15).
  WATERING_CANS: [
    { tier: 1, id: 'can_basic', name: 'Basic Watering Can', bonus: 0.05, cost: 0, level: 1 },
    { tier: 2, id: 'can_copper', name: 'Copper Watering Can', bonus: 0.10, cost: 15000, level: 5 },
    { tier: 3, id: 'can_golden', name: 'Golden Watering Can', bonus: 0.15, cost: 60000, level: 12 },
  ],
  // Hoes give each harvested plot a chance of bonus produce (+25% of the yield, min 1).
  HOES: [
    { tier: 1, id: 'hoe_wooden', name: 'Wooden Hoe', chance: 0.05, cost: 5000, level: 3 },
    { tier: 2, id: 'hoe_iron', name: 'Iron Hoe', chance: 0.10, cost: 30000, level: 8 },
    { tier: 3, id: 'hoe_golden', name: 'Golden Hoe', chance: 0.15, cost: 120000, level: 15 },
  ],

  // ---------- Fertilizer (consumable) ----------
  // cut = fraction of the REMAINING grow time removed.
  FERTILIZERS: [
    { id: 'basic', name: 'Basic Fertilizer', cut: 0.10, cost: 1500, level: 1 },
    { id: 'advanced', name: 'Advanced Fertilizer', cut: 0.20, cost: 4000, level: 5 },
    { id: 'premium', name: 'Premium Fertilizer', cut: 0.30, cost: 10000, level: 12 },
  ],
  MAX_FERT_PER_PLOT: 3,

  // Bonus items that can drop when a plot is harvested.
  HARVEST_DROPS: [
    { item: 'basic', chance: 0.06, minLevel: 1 },
    { item: 'advanced', chance: 0.02, minLevel: 5 },
    { item: 'premium', chance: 0.01, minLevel: 12 },
  ],

  // ---------- Decorations (cosmetic, one of each) ----------
  DECORATIONS: [
    { id: 'decor_fence', name: 'Wooden Fence', cost: 5000, level: 1 },
    { id: 'decor_scarecrow', name: 'Scarecrow', cost: 12000, level: 3 },
    { id: 'decor_windmill', name: 'Windmill', cost: 60000, level: 8 },
    { id: 'decor_fountain', name: 'Fountain', cost: 120000, level: 12 },
    { id: 'decor_farmhouse', name: 'Farmhouse', cost: 300000, level: 15 },
    { id: 'decor_greenhouse', name: 'Greenhouse', cost: 600000, level: 25 },
  ],

  // ---------- Farm expansions ----------
  EXPANSIONS: [
    { name: 'Starter Farm', plots: 3, cost: 0 },
    { name: 'Small Farm', plots: 5, cost: 10000 },
    { name: 'Growing Farm', plots: 8, cost: 35000 },
    { name: 'Large Farm', plots: 12, cost: 100000 },
    { name: 'Estate', plots: 18, cost: 250000 },
    { name: 'Plantation', plots: 25, cost: 500000 },
    { name: 'Agricultural Empire', plots: 35, cost: 750000 },
    { name: 'Legendary Estate', plots: 50, cost: 1000000 },
  ],

  // ---------- Market and events ----------
  MARKET_INTERVAL_MS: 3 * HOUR,
  MARKET_MIN: 0.70,
  MARKET_MAX: 1.30,
  EVENT_CHANCE: 0.4,           // chance of an event each market update
  EVENTS: [
    { id: 'rain', name: 'Rain Shower', durationMs: 2 * HOUR, growMult: 0.8,
      text: 'Crops planted during the rain grow 20% faster.' },
    { id: 'pollination', name: 'Pollination Season', durationMs: 3 * HOUR, berryBonus: 0.25,
      text: 'Berry crops give 25% more produce when harvested.' },
    { id: 'market_boom', name: 'Market Boom', durationMs: 3 * HOUR, boostMult: 1.25, boostCount: 2,
      text: 'Two crops sell for 25% more.' },
    { id: 'festival', name: 'Harvest Festival', durationMs: 3 * HOUR, xpMult: 1.25,
      text: 'Harvesting gives 25% more farming XP.' },
  ],

  // ---------- Daily quests ----------
  DAILY_QUEST_COUNT: 3,
  QUEST_BONUS_COINS: 10000,    // + 25 per farming level
  QUEST_BONUS_XP: 100,
  // Scales quest targets and flat coin rewards to match the crop prices above.
  // Used by buildQuests() in farmService.js (see the small patch).
  QUEST_VALUE_MULT: 40,

  // ---------- Contracts (rotate every 2 days, 3 per player) ----------
  CONTRACT_PERIOD_MS: 2 * DAY,
  CONTRACT_SLOTS: 3,
  CONTRACT_REWARD_MULT: 1.6,   // coins = units x base price x this
  CONTRACTS: [
    { id: 'baker', client: 'the Baker', crop: 'wheat', qty: [20, 40], level: 1 },
    { id: 'grocer', client: 'the Grocer', crop: 'carrot', qty: [15, 30], level: 1 },
    { id: 'diner', client: 'the Diner', crop: 'potato', qty: [15, 30], level: 1 },
    { id: 'salad_bar', client: 'the Salad Bar', crop: 'lettuce', qty: [15, 30], level: 1 },
    { id: 'cannery', client: 'the Cannery', crop: 'tomato', qty: [15, 30], level: 5 },
    { id: 'cornfest', client: 'the Corn Festival', crop: 'corn', qty: [15, 30], level: 5 },
    { id: 'exporter', client: 'a Fruit Exporter', crop: 'strawberry', qty: [12, 24], level: 5 },
    { id: 'kitchen', client: 'the Town Kitchen', crop: 'onion', qty: [15, 30], level: 5 },
    { id: 'winery', client: 'the Winery', crop: 'grapes', qty: [12, 24], level: 10 },
    { id: 'picnic', client: 'the Summer Picnic', crop: 'watermelon', qty: [8, 16], level: 10 },
    { id: 'pie_shop', client: 'the Pie Shop', crop: 'pumpkin', qty: [10, 20], level: 10 },
    { id: 'jam_maker', client: 'the Jam Maker', crop: 'blueberry', qty: [12, 24], level: 10 },
    { id: 'alchemist', client: 'the Alchemist', crop: 'golden_wheat', qty: [6, 12], level: 20 },
    { id: 'night_market', client: 'the Night Market', crop: 'moonberry', qty: [6, 12], level: 20 },
    { id: 'jeweler', client: 'the Royal Jeweler', crop: 'crystal_corn', qty: [6, 12], level: 20 },
    { id: 'banquet', client: 'the Royal Banquet', crop: 'dragonfruit', qty: [6, 12], level: 20 },
  ],

  // ---------- Achievements (each paid once) ----------
  // stat: level | plots_harvested | crops_harvested | plots | total_earned | contracts_done | quests_done
  // Players who already claimed one keep it; only unclaimed ones use the new numbers.
  ACHIEVEMENTS: [
    { id: 'first_harvest', name: 'First Harvest', desc: 'Harvest your first plot', stat: 'plots_harvested', min: 1, coins: 2000, xp: 50 },
    { id: 'green_thumb', name: 'Green Thumb', desc: 'Harvest 500 produce', stat: 'crops_harvested', min: 500, coins: 30000, xp: 300, title: 'Green Thumb' },
    { id: 'landowner', name: 'Landowner', desc: 'Own 12 plots', stat: 'plots', min: 12, coins: 100000, xp: 500, title: 'Landowner' },
    { id: 'contractor', name: 'Reliable Supplier', desc: 'Complete 10 contracts', stat: 'contracts_done', min: 10, coins: 80000, xp: 600, title: 'Supplier' },
    { id: 'dedicated', name: 'Dedicated Farmer', desc: 'Complete 30 daily quests', stat: 'quests_done', min: 30, coins: 120000, xp: 800 },
    { id: 'millionaire', name: 'Millionaire Farmer', desc: 'Earn 10,000,000 from farming', stat: 'total_earned', min: 10000000, coins: 500000, xp: 5000, title: 'Millionaire Farmer' },
    { id: 'master_farmer', name: 'Master Farmer', desc: 'Reach farming level 30', stat: 'level', min: 30, coins: 300000, xp: 0, title: 'Master Farmer' },
  ],
};
