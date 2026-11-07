// ============================================================
// CLAN CONFIG
// Prices, times, rewards and limits for the clan system.
// Money values are in Crowns. This file is intended to sit next
// to clanService.js inside handlers/.
// ============================================================

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const n = v => Number(v).toLocaleString('en-US');
const s = t => (t === 1 ? '' : 's');

module.exports = {
  PREFIX: '$',
  COLOR: '#5b0000',
  ICONS: {
    vault: '', owner: '', coowner: '', manager: '', senior: '', members: '', donors: '', level: '',
    rank1: '', rank2: '', rank3: '', crown: '', stats: '',
    clan: '', rank: '', contributions: '', quest: '', trophy: '',
  },

  SHOP_KEY: 'normal',
  SHOP_ITEM_ID: null,
  SHOP_ITEM_NAMES: ['clan', 'create clan', 'create a clan', 'clan creation'],
  RENAME_COST: 5000000,
  NAME_MIN: 3,
  NAME_MAX: 24,

  BASE_CAPACITY: 20,
  MAX_CO_OWNERS: 5,
  REJOIN_LOCK_MS: 5 * DAY,
  INVITE_TIMEOUT_MS: 10 * MIN,
  PRIVATE_INVITE_MIN_RANK: 4,

  DEPOSIT_HISTORY_DAYS: 7,

  INACTIVE_CLAN_MS: 30 * DAY,
  INACTIVE_MEMBER_MS: 30 * DAY,
  INACTIVE_KICKS_BEFORE_BAN: 2,
  EXEMPT_PRIVATE_FROM_INACTIVITY: true,
  SWEEP_INTERVAL_MS: 30 * MIN,
  NOTIFY_CHANNEL_ID: null,

  MAX_LEVEL: 100,
  xpToNext: level => 1000 + 300 * (level - 1),

  QUEST_COUNT: 4,
  QUEST_BONUS_XP: 500,
  QUEST_TIERS: {
    Easy: { coins: 20000, xp: 250 },
    Medium: { coins: 40000, xp: 300 },
    Hard: { coins: 100000, xp: 400 },
  },

  QUEST_POOL: [
    { id: 'eco_each_20k', cat: 'economic', tier: 'Easy', type: 'distinct', metric: 'deposit', min: 20000, target: 3, text: t => `Have ${t} member${s(t)} deposit at least ${n(20000)} Crowns each` },
    { id: 'eco_total_500k', cat: 'economic', tier: 'Medium', type: 'sum', metric: 'deposit', target: 500000, text: t => `Deposit ${n(t)} Crowns into the vault as a clan` },
    { id: 'eco_five_members', cat: 'economic', tier: 'Medium', type: 'distinct', metric: 'deposit', min: 1, target: 5, text: t => `Have ${t} different member${s(t)} make a deposit` },
    { id: 'eco_total_1m', cat: 'economic', tier: 'Hard', type: 'sum', metric: 'deposit', target: 1000000, text: t => `Reach ${n(t)} Crowns in total deposits` },
    { id: 'eco_each_100k', cat: 'economic', tier: 'Hard', type: 'distinct', metric: 'deposit', min: 100000, target: 3, text: t => `Have ${t} member${s(t)} deposit at least ${n(100000)} Crowns each` },

    { id: 'cf_win_5', cat: 'gaming', game: 'coinflip', tier: 'Hard', type: 'sum', metric: 'coinflip_win', target: 5, text: t => `Win ${t} coinflips collectively` },
    { id: 'cf_win_members', cat: 'gaming', game: 'coinflip', tier: 'Easy', type: 'distinct', metric: 'coinflip_win', min: 1, target: 3, text: t => `Have ${t} different member${s(t)} win a coinflip` },
    { id: 'cf_streak', cat: 'gaming', game: 'coinflip', tier: 'Medium', type: 'streak', metric: 'coinflip', target: 3, text: t => `Win ${t} coinflips consecutively` },
    { id: 'cf_play_members', cat: 'gaming', game: 'coinflip', tier: 'Easy', type: 'distinct', metric: 'coinflip_play', min: 1, target: 5, text: t => `Have ${t} member${s(t)} take part in coinflip` },

    { id: 'sw_win_3', cat: 'gaming', game: 'spinwheel', tier: 'Medium', type: 'sum', metric: 'spinwheel_win', target: 3, text: t => `Win the spinwheel ${t} times collectively` },
    { id: 'sw_win_members', cat: 'gaming', game: 'spinwheel', tier: 'Easy', type: 'distinct', metric: 'spinwheel_win', min: 1, target: 2, text: t => `Have ${t} different member${s(t)} win the spinwheel` },
    { id: 'sw_play_members', cat: 'gaming', game: 'spinwheel', tier: 'Hard', type: 'distinct', metric: 'spinwheel_play', min: 1, target: 5, text: t => `Have ${t} member${s(t)} spin the wheel` },

    { id: 'fm_harvest_members', cat: 'gaming', game: 'farm', tier: 'Medium', type: 'distinct', metric: 'farm_harvest', min: 1, target: 3, text: t => `Have ${t} member${s(t)} successfully harvest their farm` },
    { id: 'fm_harvest_10', cat: 'gaming', game: 'farm', tier: 'Medium', type: 'sum', metric: 'farm_harvest', target: 10, text: t => `Harvest farms ${t} times collectively` },
    { id: 'fm_play_members', cat: 'gaming', game: 'farm', tier: 'Hard', type: 'distinct', metric: 'farm_play', min: 1, target: 5, text: t => `Have ${t} member${s(t)} play the farm game` },

    { id: 'dice_win_5', cat: 'gaming', game: 'dice', tier: 'Easy', type: 'sum', metric: 'dice_win', target: 5, text: t => `Win ${t} dice games collectively` },
    { id: 'dice_win_members', cat: 'gaming', game: 'dice', tier: 'Easy', type: 'distinct', metric: 'dice_win', min: 1, target: 3, text: t => `Have ${t} different member${s(t)} win a dice game` },
    { id: 'dice_play_members', cat: 'gaming', game: 'dice', tier: 'Medium', type: 'distinct', metric: 'dice_play', min: 1, target: 5, text: t => `Have ${t} member${s(t)} take part in dice` },

    { id: 'bj_win_5', cat: 'gaming', game: 'blackjack', tier: 'Hard', type: 'sum', metric: 'blackjack_win', target: 5, text: t => `Win ${t} blackjack games collectively` },
    { id: 'bj_win_members', cat: 'gaming', game: 'blackjack', tier: 'Medium', type: 'distinct', metric: 'blackjack_win', min: 1, target: 3, text: t => `Have ${t} different member${s(t)} win blackjack` },
    { id: 'bj_streak', cat: 'gaming', game: 'blackjack', tier: 'Hard', type: 'streak', metric: 'blackjack', target: 3, text: t => `Win ${t} blackjack games consecutively` },

    { id: 'rec_1', cat: 'recruitment', tier: 'Easy', type: 'sum', metric: 'recruit', target: 1, text: t => `Invite ${t} new member${s(t)} to the clan` },
    { id: 'rec_2', cat: 'recruitment', tier: 'Medium', type: 'sum', metric: 'recruit', target: 2, text: t => `Have ${t} new members join the clan` },
    { id: 'rec_3_invite', cat: 'recruitment', tier: 'Hard', type: 'sum', metric: 'recruit_invite', target: 3, text: t => `Have ${t} new members join the clan by invitation` },
  ],

  XP_BOOSTER_DURATION_MS: 7 * DAY,
  XP_BOOSTER_MAX_STACK_MS: 28 * DAY,
  XP_BOOSTER: [
    { cost: 1000000, bonus: 0.10, xp: 150 },
    { cost: 2500000, bonus: 0.20, xp: 300 },
    { cost: 6000000, bonus: 0.30, xp: 600 },
    { cost: 12000000, bonus: 0.40, xp: 1000 },
    { cost: 25000000, bonus: 0.50, xp: 1600 },
  ],
  CAPACITY: [
    { cost: 4000000, capacity: 25, xp: 300 },
    { cost: 10000000, capacity: 30, xp: 600 },
    { cost: 25000000, capacity: 40, xp: 1200 },
    { cost: 60000000, capacity: 50, xp: 2400 },
    { cost: 120000000, capacity: 60, xp: 3500 },
  ],

  MAX_IMAGE_BYTES: 8 * 1024 * 1024,
  TZ_OFFSET_MS: 6 * HOUR,
};