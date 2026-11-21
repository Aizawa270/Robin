'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// pokemonService.js is stored in <project>/handlers, so the database belongs
// in <project>/data (one directory up from this file).
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'pokemon.sqlite');

// Older versions of this file accidentally used ../../data. Preserve that
// database when possible instead of silently starting a fresh collection.
const LEGACY_DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'pokemon.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });

if (
  path.resolve(LEGACY_DB_PATH) !== path.resolve(DB_PATH) &&
  !fs.existsSync(DB_PATH) &&
  fs.existsSync(LEGACY_DB_PATH)
) {
  try {
    fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);

    // A WAL can contain committed records not yet checkpointed into the main
    // database file. Copy it as well when migrating an old, stopped instance.
    if (fs.existsSync(`${LEGACY_DB_PATH}-wal`)) {
      fs.copyFileSync(`${LEGACY_DB_PATH}-wal`, `${DB_PATH}-wal`);
    }

    console.log('[Pokémon] Migrated the previous database into the project data folder.');
  } catch (error) {
    console.error('[Pokémon] Could not migrate the previous database:', error);
    throw error;
  }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

const PACK_TYPES = Object.freeze(['common', 'rare', 'mythical']);
const CARD_RARITY = Object.freeze({
  common: { label: 'Common', color: 0x9CA3AF },
  rare: { label: 'Rare', color: 0x3B82F6 },
  mythical: { label: 'Mythical', color: 0x111827 },
});

// Thresholds are out of 10,000. Mythical pulls are intentionally scarce:
// Common pack: 0.10%, Rare pack: 0.25%, Mythical pack: 1.50%.
const PACK_DROP_RATES = Object.freeze({
  common: [9300, 9990, 10000],
  rare: [7800, 9975, 10000],
  mythical: [6000, 9850, 10000],
});

// Shiny is an independent property, not a card rarity. A shiny Pidgey remains
// Common/Rare/Mythical according to its normal rarity roll.
const SHINY_CHANCE_DENOMINATOR = 4096;

const BURN_REWARDS = Object.freeze({
  common: 1000,
  rare: 5000,
  mythical: 15000,
});

const OPEN_COOLDOWN_MS = 5000;
const CARDS_PER_PACK = 10;
const MAX_COLLECTIONS_CARDS = 8;
const CARD_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const activeOpenings = new Set();
const sessions = new Map();
const browseSessions = new Map();

const QUESTS = Object.freeze([
  {
    id: 'd_open_2',
    scope: 'daily',
    title: 'Pack Opener',
    description: 'Open 2 packs',
    metric: 'packs_opened',
    target: 2,
    rewardType: 'common',
    rewardAmount: 1,
  },
  {
    id: 'd_collect_5',
    scope: 'daily',
    title: 'Growing Collection',
    description: 'Collect 5 cards',
    metric: 'cards_collected',
    target: 5,
    rewardType: 'common',
    rewardAmount: 1,
  },
  {
    id: 'd_discover_3',
    scope: 'daily',
    title: 'New Discoveries',
    description: 'Discover 3 different Pokémon',
    metric: 'unique_discovered',
    target: 3,
    rewardType: 'rare',
    rewardAmount: 1,
  },
  {
    id: 'w_open_10',
    scope: 'weekly',
    title: 'Dedicated Collector',
    description: 'Open 10 packs',
    metric: 'packs_opened',
    target: 10,
    rewardType: 'rare',
    rewardAmount: 1,
  },
  {
    id: 'w_unique_15',
    scope: 'weekly',
    title: 'Regional Researcher',
    description: 'Discover 15 different Pokémon',
    metric: 'unique_discovered',
    target: 15,
    rewardType: 'rare',
    rewardAmount: 1,
  },
  {
    id: 'a_mythical_1',
    scope: 'achievement',
    title: 'Mythical Discovery',
    description: 'Collect your first Mythical-tier card',
    metric: 'mythical_collected',
    target: 1,
    rewardType: 'mythical',
    rewardAmount: 1,
  },
  {
    id: 'a_unique_50',
    scope: 'achievement',
    title: 'Pokédex Enthusiast',
    description: 'Discover 50 different Pokémon',
    metric: 'unique_discovered',
    target: 50,
    rewardType: 'mythical',
    rewardAmount: 1,
  },
]);

function normalizePackType(value) {
  const type = String(value || '').trim().toLowerCase();
  // Accept the shorter spelling in commands while keeping one canonical DB value.
  return type === 'mythic' ? 'mythical' : type;
}

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pokemon_species (
      species_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      generation INTEGER NOT NULL,
      rarity TEXT NOT NULL CHECK (rarity IN ('common','rare','mythical')),
      is_legendary INTEGER NOT NULL DEFAULT 0,
      is_mythical INTEGER NOT NULL DEFAULT 0,
      pokemon_id INTEGER NOT NULL,
      artwork_url TEXT NOT NULL,
      types TEXT NOT NULL DEFAULT '[]',
      api_url TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pokemon_players (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS pokemon_player_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      cards_collected INTEGER NOT NULL DEFAULT 0,
      packs_opened INTEGER NOT NULL DEFAULT 0,
      mythical_collected INTEGER NOT NULL DEFAULT 0,
      rare_collected INTEGER NOT NULL DEFAULT 0,
      cards_gifted INTEGER NOT NULL DEFAULT 0,
      cards_burned INTEGER NOT NULL DEFAULT 0,
      collections_created INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS pokemon_pack_balances (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      pack_type TEXT NOT NULL CHECK (pack_type IN ('common','rare','mythical')),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      PRIMARY KEY (guild_id, user_id, pack_type)
    );

    CREATE TABLE IF NOT EXISTS pokemon_cards (
      card_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      species_id INTEGER NOT NULL,
      rarity TEXT NOT NULL CHECK (rarity IN ('common','rare','mythical')),
      source TEXT NOT NULL DEFAULT 'pack',
      acquired_at INTEGER NOT NULL,
      is_shiny INTEGER NOT NULL DEFAULT 0 CHECK (is_shiny IN (0,1)),
      FOREIGN KEY (species_id) REFERENCES pokemon_species(species_id)
    );

    CREATE INDEX IF NOT EXISTS idx_pokemon_cards_owner
      ON pokemon_cards(guild_id, user_id, acquired_at DESC);

    CREATE INDEX IF NOT EXISTS idx_pokemon_cards_rarity
      ON pokemon_cards(guild_id, user_id, rarity);

    CREATE TABLE IF NOT EXISTS pokemon_collections (
      collection_id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      hex_color TEXT NOT NULL DEFAULT '#3B82F6',
      created_at INTEGER NOT NULL,
      UNIQUE(guild_id, user_id, name COLLATE NOCASE)
    );

    CREATE TABLE IF NOT EXISTS pokemon_collection_cards (
      collection_id INTEGER NOT NULL,
      card_id TEXT NOT NULL UNIQUE,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (collection_id, card_id),
      FOREIGN KEY (collection_id)
        REFERENCES pokemon_collections(collection_id) ON DELETE CASCADE,
      FOREIGN KEY (card_id)
        REFERENCES pokemon_cards(card_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pokemon_pokedex (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      species_id INTEGER NOT NULL,
      first_discovered_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, species_id),
      FOREIGN KEY (species_id) REFERENCES pokemon_species(species_id)
    );

    CREATE TABLE IF NOT EXISTS pokemon_open_cooldowns (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_opened_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS pokemon_quest_progress (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      period_key TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      claimed_at INTEGER,
      PRIMARY KEY (guild_id, user_id, quest_id, period_key)
    );

    CREATE TABLE IF NOT EXISTS pokemon_daily_claims (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      day_key TEXT NOT NULL,
      claimed_at INTEGER NOT NULL,
      reward_type TEXT NOT NULL,
      reward_amount INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, day_key)
    );

    CREATE TABLE IF NOT EXISTS pokemon_shop_products (
      guild_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      pack_type TEXT NOT NULL CHECK (pack_type IN ('common','rare','mythical')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, item_id),
      UNIQUE(guild_id, pack_type)
    );

    CREATE TABLE IF NOT EXISTS pokemon_purchase_log (
      purchase_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      pack_type TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 1,
      purchased_at INTEGER NOT NULL
    );
  `);

  // Migrate databases created by earlier versions of this service.
  const speciesColumns = db.prepare('PRAGMA table_info(pokemon_species)').all();
  if (!speciesColumns.some(column => column.name === 'types')) {
    db.exec("ALTER TABLE pokemon_species ADD COLUMN types TEXT NOT NULL DEFAULT '[]'");
  }

  const statsColumns = db.prepare('PRAGMA table_info(pokemon_player_stats)').all();
  if (!statsColumns.some(column => column.name === 'collections_created')) {
    db.exec(`
      ALTER TABLE pokemon_player_stats
      ADD COLUMN collections_created INTEGER NOT NULL DEFAULT 0
    `);
  }

  // Existing cards migrate as non-shiny. New packs independently roll the flag.
  const cardColumns = db.prepare('PRAGMA table_info(pokemon_cards)').all();
  if (!cardColumns.some(column => column.name === 'is_shiny')) {
    db.exec('ALTER TABLE pokemon_cards ADD COLUMN is_shiny INTEGER NOT NULL DEFAULT 0');
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pokemon_cards_shiny
    ON pokemon_cards(guild_id, user_id, is_shiny)
  `);
}

ensureSchema();

const stmt = {
  ensurePlayer: db.prepare(`
    INSERT INTO pokemon_players (guild_id, user_id, created_at, last_seen_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET last_seen_at = excluded.last_seen_at
  `),

  ensureStats: db.prepare(`
    INSERT OR IGNORE INTO pokemon_player_stats (guild_id, user_id)
    VALUES (?, ?)
  `),

  ensurePackBalance: db.prepare(`
    INSERT OR IGNORE INTO pokemon_pack_balances
      (guild_id, user_id, pack_type, quantity)
    VALUES (?, ?, ?, 0)
  `),

  getPacks: db.prepare(`
    SELECT pack_type, quantity
    FROM pokemon_pack_balances
    WHERE guild_id = ? AND user_id = ?
  `),

  getPack: db.prepare(`
    SELECT quantity
    FROM pokemon_pack_balances
    WHERE guild_id = ? AND user_id = ? AND pack_type = ?
  `),

  addPack: db.prepare(`
    INSERT INTO pokemon_pack_balances
      (guild_id, user_id, pack_type, quantity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, pack_type)
    DO UPDATE SET quantity = quantity + excluded.quantity
  `),

  getSpeciesByRarity: db.prepare(`
    SELECT *
    FROM pokemon_species
    WHERE rarity = ?
    ORDER BY species_id
  `),

  getCard: db.prepare(`
    SELECT
      c.*,
      s.name AS pokemon_name,
      s.generation,
      s.artwork_url,
      s.types
    FROM pokemon_cards c
    JOIN pokemon_species s ON s.species_id = c.species_id
    WHERE c.card_id = ? AND c.guild_id = ?
  `),

  getStats: db.prepare(`
    SELECT *
    FROM pokemon_player_stats
    WHERE guild_id = ? AND user_id = ?
  `),
};

function normalizeGuildUser(guildId, userId) {
  if (!guildId || !userId) {
    throw new Error('A server and user are required.');
  }

  return {
    gid: String(guildId),
    uid: String(userId),
  };
}

function ensurePlayer(guildId, userId, now = Date.now()) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);

  stmt.ensurePlayer.run(gid, uid, now, now);
  stmt.ensureStats.run(gid, uid);

  for (const type of PACK_TYPES) {
    stmt.ensurePackBalance.run(gid, uid, type);
  }
}

function getPackBalances(guildId, userId) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);
  ensurePlayer(gid, uid);

  const rows = stmt.getPacks.all(gid, uid);
  const output = {
    common: 0,
    rare: 0,
    mythical: 0,
  };

  for (const row of rows) {
    output[row.pack_type] = Number(row.quantity || 0);
  }

  return output;
}

function addPacks(guildId, userId, packType, amount = 1) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);
  const type = normalizePackType(packType);
  const quantity = Math.floor(Number(amount));

  if (
    !PACK_TYPES.includes(type) ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > 10000
  ) {
    return { ok: false, code: 'invalid_pack' };
  }

  const transaction = db.transaction(() => {
    ensurePlayer(gid, uid);
    stmt.addPack.run(gid, uid, type, quantity);
  });

  transaction();

  return {
    ok: true,
    balances: getPackBalances(gid, uid),
  };
}

function randomCardId() {
  let id = '';

  for (let index = 0; index < 6; index++) {
    id += CARD_ID_ALPHABET[crypto.randomInt(CARD_ID_ALPHABET.length)];
  }

  return id;
}

function makeUniqueCardId() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = randomCardId();
    const exists = db.prepare(
      'SELECT 1 FROM pokemon_cards WHERE card_id = ?'
    ).get(id);

    if (!exists) return id;
  }

  throw new Error('Could not generate a unique card ID.');
}

function dateKeyUTC6(timestamp = Date.now()) {
  const date = new Date(timestamp + 6 * 60 * 60 * 1000);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function weekKeyUTC6(timestamp = Date.now()) {
  const date = new Date(timestamp + 6 * 60 * 60 * 1000);
  const weekday = date.getUTCDay();

  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function periodKey(scope, now = Date.now()) {
  if (scope === 'daily') return dateKeyUTC6(now);
  if (scope === 'weekly') return weekKeyUTC6(now);
  return 'all';
}

function addQuestProgress(guildId, userId, metric, amount, now = Date.now()) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);
  const value = Math.max(0, Math.floor(Number(amount) || 0));

  if (!value) return;

  for (const quest of QUESTS) {
    if (quest.metric !== metric) continue;

    db.prepare(`
      INSERT INTO pokemon_quest_progress
        (guild_id, user_id, quest_id, period_key, progress)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id, quest_id, period_key)
      DO UPDATE SET progress = MIN(1000000, progress + excluded.progress)
    `).run(
      gid,
      uid,
      quest.id,
      periodKey(quest.scope, now),
      value
    );
  }
}

function chooseRarity(packType) {
  const type = normalizePackType(packType);
  const rates = PACK_DROP_RATES[type];
  const roll = crypto.randomInt(10000);

  if (roll < rates[0]) return 'common';
  if (roll < rates[1]) return 'rare';
  return 'mythical';
}

function pickSpecies(rarity) {
  const pool = stmt.getSpeciesByRarity.all(rarity);
  if (!pool.length) return null;

  return pool[crypto.randomInt(pool.length)];
}

function pickAvailableSpecies(requestedRarity) {
  const preferred = pickSpecies(requestedRarity);
  if (preferred) {
    return {
      species: preferred,
      rarity: requestedRarity,
    };
  }

  // If a rarity has not been populated yet, fall back to an available pool
  // and use that species' actual rarity rather than mislabelling the card.
  for (const fallback of ['common', 'rare', 'mythical']) {
    const species = pickSpecies(fallback);
    if (species) {
      return {
        species,
        rarity: fallback,
      };
    }
  }

  return null;
}

function openPack(guildId, userId, packType, now = Date.now()) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);
  const type = normalizePackType(packType);

  if (!PACK_TYPES.includes(type)) {
    return { ok: false, code: 'invalid_pack' };
  }

  const lockKey = `${gid}:${uid}`;

  // A card-by-card display remains active until it is closed or expires.
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId);
      continue;
    }

    if (session.guildId === gid && session.userId === uid) {
      return { ok: false, code: 'already_opening' };
    }
  }

  if (activeOpenings.has(lockKey)) {
    return { ok: false, code: 'already_opening' };
  }

  activeOpenings.add(lockKey);

  try {
    ensurePlayer(gid, uid, now);

    const cooldown = db.prepare(`
      SELECT last_opened_at
      FROM pokemon_open_cooldowns
      WHERE guild_id = ? AND user_id = ?
    `).get(gid, uid);

    const elapsed = cooldown
      ? now - Number(cooldown.last_opened_at)
      : OPEN_COOLDOWN_MS;

    if (cooldown && elapsed < OPEN_COOLDOWN_MS) {
      return {
        ok: false,
        code: 'cooldown',
        remaining: OPEN_COOLDOWN_MS - elapsed,
      };
    }

    const packRow = stmt.getPack.get(gid, uid, type);

    if (!packRow || Number(packRow.quantity) <= 0) {
      return { ok: false, code: 'no_packs' };
    }

    const generated = [];

    for (let index = 0; index < CARDS_PER_PACK; index++) {
      const wantedRarity = chooseRarity(type);
      const selected = pickAvailableSpecies(wantedRarity);

      if (!selected) {
        return { ok: false, code: 'species_not_synced' };
      }

      generated.push({
        ...selected,
        is_shiny: crypto.randomInt(SHINY_CHANCE_DENOMINATOR) === 0 ? 1 : 0,
      });
    }

    const openTransaction = db.transaction(() => {
      const currentPack = stmt.getPack.get(gid, uid, type);

      if (!currentPack || Number(currentPack.quantity) <= 0) {
        throw new Error('NO_PACKS');
      }

      const latestCooldown = db.prepare(`
        SELECT last_opened_at
        FROM pokemon_open_cooldowns
        WHERE guild_id = ? AND user_id = ?
      `).get(gid, uid);

      if (
        latestCooldown &&
        now - Number(latestCooldown.last_opened_at) < OPEN_COOLDOWN_MS
      ) {
        throw new Error('COOLDOWN');
      }

      db.prepare(`
        UPDATE pokemon_pack_balances
        SET quantity = quantity - 1
        WHERE guild_id = ? AND user_id = ? AND pack_type = ?
      `).run(gid, uid, type);

      const cards = [];
      let newDiscoveries = 0;
      let mythicalCount = 0;
      let rareCount = 0;

      for (const item of generated) {
        const cardId = makeUniqueCardId();

        db.prepare(`
          INSERT INTO pokemon_cards
            (card_id, guild_id, user_id, species_id, rarity, source, acquired_at, is_shiny)
          VALUES (?, ?, ?, ?, ?, 'pack', ?, ?)
        `).run(
          cardId,
          gid,
          uid,
          item.species.species_id,
          item.rarity,
          now,
          item.is_shiny
        );

        const discovered = db.prepare(`
          INSERT OR IGNORE INTO pokemon_pokedex
            (guild_id, user_id, species_id, first_discovered_at)
          VALUES (?, ?, ?, ?)
        `).run(gid, uid, item.species.species_id, now);

        if (discovered.changes) newDiscoveries++;
        if (item.rarity === 'mythical') mythicalCount++;
        if (item.rarity === 'rare') rareCount++;

        cards.push({
          card_id: cardId,
          species_id: item.species.species_id,
          pokemon_name: item.species.name,
          generation: item.species.generation,
          rarity: item.rarity,
          is_shiny: item.is_shiny,
          artwork_url: item.species.artwork_url,
          types: item.species.types || '[]',
        });
      }

      db.prepare(`
        UPDATE pokemon_player_stats
        SET
          cards_collected = cards_collected + ?,
          packs_opened = packs_opened + 1,
          mythical_collected = mythical_collected + ?,
          rare_collected = rare_collected + ?
        WHERE guild_id = ? AND user_id = ?
      `).run(cards.length, mythicalCount, rareCount, gid, uid);

      db.prepare(`
        INSERT INTO pokemon_open_cooldowns
          (guild_id, user_id, last_opened_at)
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id, user_id)
        DO UPDATE SET last_opened_at = excluded.last_opened_at
      `).run(gid, uid, now);

      addQuestProgress(gid, uid, 'packs_opened', 1, now);
      addQuestProgress(gid, uid, 'cards_collected', cards.length, now);
      addQuestProgress(gid, uid, 'unique_discovered', newDiscoveries, now);
      addQuestProgress(gid, uid, 'mythical_collected', mythicalCount, now);

      return cards;
    });

    try {
      const cards = openTransaction();
      const counts = {
        common: 0,
        rare: 0,
        mythical: 0,
      };

      for (const card of cards) {
        counts[card.rarity]++;
      }

      return {
        ok: true,
        cards,
        counts,
        balances: getPackBalances(gid, uid),
      };
    } catch (error) {
      if (error.message === 'NO_PACKS') {
        return { ok: false, code: 'no_packs' };
      }

      if (error.message === 'COOLDOWN') {
        return {
          ok: false,
          code: 'cooldown',
          remaining: OPEN_COOLDOWN_MS,
        };
      }

      throw error;
    }
  } finally {
    activeOpenings.delete(lockKey);
  }
}

function getInventory(guildId, userId, options = {}) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const limit = Math.max(1, Math.min(20, Math.floor(Number(options.limit) || 10)));
  const rarityValue = options.rarity
    ? normalizePackType(options.rarity)
    : null;
  const rarity = rarityValue && PACK_TYPES.includes(rarityValue)
    ? rarityValue
    : null;
  const search = String(options.search || '').trim().toLowerCase();

  const where = [
    'c.guild_id = ?',
    'c.user_id = ?',
  ];
  const params = [gid, uid];

  if (rarity) {
    where.push('c.rarity = ?');
    params.push(rarity);
  }

  if (search) {
    where.push('LOWER(s.name) LIKE ?');
    params.push(`%${search}%`);
  }

  const whereSql = where.join(' AND ');

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM pokemon_cards c
    JOIN pokemon_species s ON s.species_id = c.species_id
    WHERE ${whereSql}
  `).get(...params);

  const total = Number(totalRow?.count || 0);

  const cards = db.prepare(`
    SELECT
      c.card_id,
      c.species_id,
      c.rarity,
      c.acquired_at,
      c.is_shiny,
      s.name AS pokemon_name,
      s.generation,
      s.artwork_url,
      s.types
    FROM pokemon_cards c
    JOIN pokemon_species s ON s.species_id = c.species_id
    WHERE ${whereSql}
    ORDER BY c.acquired_at DESC, c.card_id ASC
    LIMIT ? OFFSET ?
  `).all(
    ...params,
    limit,
    (page - 1) * limit
  );

  return {
    cards,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  };
}

function getCard(guildId, cardId) {
  if (!guildId || !cardId) return null;

  return stmt.getCard.get(
    String(cardId).trim(),
    String(guildId)
  ) || null;
}

function giftCards(guildId, senderId, recipientId, cardIds, now = Date.now()) {
  const gid = String(guildId || '');
  const sender = String(senderId || '');
  const recipient = String(recipientId || '');
  const ids = [...new Set((cardIds || []).map(id => String(id).trim()))];

  if (!gid || !sender || !recipient) {
    return { ok: false, code: 'invalid_user' };
  }

  if (!ids.length || ids.length > 25) {
    return { ok: false, code: 'invalid_count' };
  }

  if (sender === recipient) {
    return { ok: false, code: 'self_gift' };
  }

  const transaction = db.transaction(() => {
    ensurePlayer(gid, sender, now);
    ensurePlayer(gid, recipient, now);

    const cards = ids.map(id => db.prepare(`
      SELECT card_id, species_id, rarity
      FROM pokemon_cards
      WHERE guild_id = ? AND user_id = ? AND card_id = ?
    `).get(gid, sender, id));

    if (cards.some(card => !card)) {
      throw new Error('CARD_NOT_OWNED');
    }

    const updateOwner = db.prepare(`
      UPDATE pokemon_cards
      SET user_id = ?
      WHERE guild_id = ? AND user_id = ? AND card_id = ?
    `);

    let newDiscoveries = 0;

    for (const card of cards) {
      db.prepare(`
        DELETE FROM pokemon_collection_cards
        WHERE card_id = ?
      `).run(card.card_id);

      updateOwner.run(recipient, gid, sender, card.card_id);

      const discovery = db.prepare(`
        INSERT OR IGNORE INTO pokemon_pokedex
          (guild_id, user_id, species_id, first_discovered_at)
        VALUES (?, ?, ?, ?)
      `).run(gid, recipient, card.species_id, now);

      if (discovery.changes) newDiscoveries++;

      if (card.rarity === 'mythical') {
        db.prepare(`
          UPDATE pokemon_player_stats
          SET mythical_collected = mythical_collected + 1
          WHERE guild_id = ? AND user_id = ?
        `).run(gid, recipient);
      }

      if (card.rarity === 'rare') {
        db.prepare(`
          UPDATE pokemon_player_stats
          SET rare_collected = rare_collected + 1
          WHERE guild_id = ? AND user_id = ?
        `).run(gid, recipient);
      }
    }

    db.prepare(`
      UPDATE pokemon_player_stats
      SET cards_gifted = cards_gifted + ?
      WHERE guild_id = ? AND user_id = ?
    `).run(cards.length, gid, sender);

    db.prepare(`
      UPDATE pokemon_player_stats
      SET cards_collected = cards_collected + ?
      WHERE guild_id = ? AND user_id = ?
    `).run(cards.length, gid, recipient);

    addQuestProgress(gid, recipient, 'cards_collected', cards.length, now);
    addQuestProgress(gid, recipient, 'unique_discovered', newDiscoveries, now);
    addQuestProgress(
      gid,
      recipient,
      'mythical_collected',
      cards.filter(card => card.rarity === 'mythical').length,
      now
    );

    return {
      count: cards.length,
      newDiscoveries,
    };
  });

  try {
    return {
      ok: true,
      ...transaction(),
    };
  } catch (error) {
    if (error.message === 'CARD_NOT_OWNED') {
      return { ok: false, code: 'card_not_owned' };
    }

    throw error;
  }
}

function burnCards(guildId, userId, cardIds) {
  const gid = String(guildId || '');
  const uid = String(userId || '');
  const ids = [...new Set((cardIds || []).map(id => String(id).trim()))];

  if (!gid || !uid) {
    return { ok: false, code: 'invalid_user' };
  }

  if (!ids.length || ids.length > 25) {
    return { ok: false, code: 'invalid_count' };
  }

  const transaction = db.transaction(() => {
    ensurePlayer(gid, uid);

    const cards = ids.map(id => db.prepare(`
      SELECT card_id, rarity
      FROM pokemon_cards
      WHERE guild_id = ? AND user_id = ? AND card_id = ?
    `).get(gid, uid, id));

    if (cards.some(card => !card)) {
      throw new Error('CARD_NOT_OWNED');
    }

    const burnedByRarity = { common: 0, rare: 0, mythical: 0 };
    const rewardByRarity = { common: 0, rare: 0, mythical: 0 };

    for (const card of cards) {
      const rarity = String(card.rarity || '').toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(BURN_REWARDS, rarity)) {
        throw new Error(`INVALID_CARD_RARITY:${rarity}`);
      }
      burnedByRarity[rarity]++;
      rewardByRarity[rarity] += BURN_REWARDS[rarity];
    }

    const removeCard = db.prepare(`
      DELETE FROM pokemon_cards
      WHERE guild_id = ? AND user_id = ? AND card_id = ?
    `);

    for (const id of ids) {
      removeCard.run(gid, uid, id);
    }

    db.prepare(`
      UPDATE pokemon_player_stats
      SET cards_burned = cards_burned + ?
      WHERE guild_id = ? AND user_id = ?
    `).run(ids.length, gid, uid);

    return {
      count: ids.length,
      burnedByRarity,
      rewardByRarity,
      rewardTotal: Object.values(rewardByRarity).reduce((sum, amount) => sum + amount, 0),
    };
  });

  try {
    return {
      ok: true,
      ...transaction(),
    };
  } catch (error) {
    if (error.message === 'CARD_NOT_OWNED') {
      return { ok: false, code: 'card_not_owned' };
    }

    throw error;
  }
}

function createCollection(guildId, userId, name, now = Date.now()) {
  const gid = String(guildId || '');
  const uid = String(userId || '');
  const cleanName = String(name || '').trim();

  if (!gid || !uid) {
    return { ok: false, code: 'invalid_user' };
  }

  if (!cleanName || cleanName.length > 40) {
    return { ok: false, code: 'invalid_name' };
  }

  ensurePlayer(gid, uid, now);

  try {
    const result = db.prepare(`
      INSERT INTO pokemon_collections
        (guild_id, user_id, name, hex_color, created_at)
      VALUES (?, ?, ?, '#3B82F6', ?)
    `).run(gid, uid, cleanName, now);

    db.prepare(`
      UPDATE pokemon_player_stats
      SET collections_created = collections_created + 1
      WHERE guild_id = ? AND user_id = ?
    `).run(gid, uid);

    return {
      ok: true,
      collection: getCollectionById(result.lastInsertRowid),
    };
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error.message)) {
      return { ok: false, code: 'name_exists' };
    }

    throw error;
  }
}

function getCollectionById(id) {
  return db.prepare(`
    SELECT *
    FROM pokemon_collections
    WHERE collection_id = ?
  `).get(Number(id)) || null;
}

function getCollection(guildId, userId, name) {
  return db.prepare(`
    SELECT *
    FROM pokemon_collections
    WHERE guild_id = ? AND user_id = ? AND name = ? COLLATE NOCASE
  `).get(
    String(guildId),
    String(userId),
    String(name || '').trim()
  ) || null;
}

function listCollections(guildId, userId) {
  return db.prepare(`
    SELECT
      c.collection_id,
      c.name,
      c.hex_color,
      c.created_at,
      COUNT(cc.card_id) AS card_count
    FROM pokemon_collections c
    LEFT JOIN pokemon_collection_cards cc
      ON cc.collection_id = c.collection_id
    WHERE c.guild_id = ? AND c.user_id = ?
    GROUP BY c.collection_id
    ORDER BY c.created_at ASC, c.collection_id ASC
  `).all(String(guildId), String(userId));
}

function deleteCollection(guildId, userId, name) {
  const collection = getCollection(guildId, userId, name);

  if (!collection) {
    return { ok: false, code: 'not_found' };
  }

  db.prepare(`
    DELETE FROM pokemon_collections
    WHERE collection_id = ?
  `).run(collection.collection_id);

  return {
    ok: true,
    collection,
  };
}

function addCardToCollection(guildId, userId, cardId, collectionName, now = Date.now()) {
  const collection = getCollection(guildId, userId, collectionName);

  if (!collection) {
    return { ok: false, code: 'collection_not_found' };
  }

  const card = db.prepare(`
    SELECT card_id
    FROM pokemon_cards
    WHERE guild_id = ? AND user_id = ? AND card_id = ?
  `).get(String(guildId), String(userId), String(cardId));

  if (!card) {
    return { ok: false, code: 'card_not_owned' };
  }

  const countRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM pokemon_collection_cards
    WHERE collection_id = ?
  `).get(collection.collection_id);

  const count = Number(countRow?.count || 0);

  if (count >= MAX_COLLECTIONS_CARDS) {
    return { ok: false, code: 'collection_full' };
  }

  try {
    db.prepare(`
      INSERT INTO pokemon_collection_cards
        (collection_id, card_id, added_at)
      VALUES (?, ?, ?)
    `).run(collection.collection_id, String(cardId), now);

    return {
      ok: true,
      count: count + 1,
    };
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error.message)) {
      return { ok: false, code: 'card_already_in_collection' };
    }

    throw error;
  }
}

function removeCardFromCollection(guildId, userId, cardId, collectionName) {
  const collection = getCollection(guildId, userId, collectionName);

  if (!collection) {
    return { ok: false, code: 'collection_not_found' };
  }

  const result = db.prepare(`
    DELETE FROM pokemon_collection_cards
    WHERE collection_id = ? AND card_id = ?
  `).run(collection.collection_id, String(cardId));

  return result.changes
    ? { ok: true }
    : { ok: false, code: 'card_not_in_collection' };
}

function setCollectionHex(guildId, userId, collectionName, hex) {
  const collection = getCollection(guildId, userId, collectionName);

  if (!collection) {
    return { ok: false, code: 'collection_not_found' };
  }

  const color = String(hex || '').trim();

  if (!/^#?[0-9a-fA-F]{6}$/.test(color)) {
    return { ok: false, code: 'invalid_hex' };
  }

  const normalized = color.startsWith('#')
    ? color.toUpperCase()
    : `#${color.toUpperCase()}`;

  db.prepare(`
    UPDATE pokemon_collections
    SET hex_color = ?
    WHERE collection_id = ?
  `).run(normalized, collection.collection_id);

  return {
    ok: true,
    hex: normalized,
  };
}

function getCollectionDisplay(guildId, userId, collectionName) {
  const collection = getCollection(guildId, userId, collectionName);
  if (!collection) return null;

  const cards = db.prepare(`
    SELECT
      c.card_id,
      c.rarity,
      c.is_shiny,
      c.species_id,
      s.name AS pokemon_name,
      s.generation,
      s.artwork_url,
      s.types
    FROM pokemon_collection_cards cc
    JOIN pokemon_cards c ON c.card_id = cc.card_id
    JOIN pokemon_species s ON s.species_id = c.species_id
    WHERE cc.collection_id = ?
    ORDER BY cc.added_at ASC, cc.card_id ASC
  `).all(collection.collection_id);

  return {
    collection,
    cards,
  };
}

function getPokedex(guildId, userId, generation = null, page = 1, limit = 25) {
  const gid = String(guildId || '');
  const uid = String(userId || '');
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(limit) || 25)));
  const generationNumber = Number(generation);
  const hasGeneration =
    generation !== null &&
    generation !== undefined &&
    generation !== '' &&
    Number.isInteger(generationNumber) &&
    generationNumber >= 1 &&
    generationNumber <= 9;

  const speciesWhere = hasGeneration ? ' WHERE generation = ?' : '';
  const speciesParams = hasGeneration ? [generationNumber] : [];

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM pokemon_species
    ${speciesWhere}
  `).get(...speciesParams);

  const foundRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM pokemon_pokedex p
    JOIN pokemon_species s ON s.species_id = p.species_id
    WHERE p.guild_id = ? AND p.user_id = ?
    ${hasGeneration ? 'AND s.generation = ?' : ''}
  `).get(
    gid,
    uid,
    ...(hasGeneration ? [generationNumber] : [])
  );

  const rows = db.prepare(`
    SELECT
      s.species_id,
      s.name,
      s.generation,
      s.rarity,
      s.artwork_url,
      s.types,
      CASE WHEN p.species_id IS NULL THEN 0 ELSE 1 END AS discovered
    FROM pokemon_species s
    LEFT JOIN pokemon_pokedex p
      ON p.species_id = s.species_id
      AND p.guild_id = ?
      AND p.user_id = ?
    ${speciesWhere}
    ORDER BY s.species_id
    LIMIT ? OFFSET ?
  `).all(
    gid,
    uid,
    ...speciesParams,
    safeLimit,
    (safePage - 1) * safeLimit
  );

  const total = Number(totalRow?.count || 0);
  const found = Number(foundRow?.count || 0);

  return {
    rows,
    total,
    found,
    page: safePage,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

function getPlayerStats(guildId, userId) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);

  ensurePlayer(gid, uid);

  const stats = stmt.getStats.get(gid, uid) || {};

  const uniqueRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM pokemon_pokedex
    WHERE guild_id = ? AND user_id = ?
  `).get(gid, uid);

  const cardBreakdown = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN rarity = 'common' THEN 1 ELSE 0 END) AS common_count,
      SUM(CASE WHEN rarity = 'rare' THEN 1 ELSE 0 END) AS rare_count,
      SUM(CASE WHEN rarity = 'mythical' THEN 1 ELSE 0 END) AS mythical_count,
      SUM(CASE WHEN is_shiny = 1 THEN 1 ELSE 0 END) AS shiny_count
    FROM pokemon_cards
    WHERE guild_id = ? AND user_id = ?
  `).get(gid, uid) || {};

  const collectionsRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM pokemon_collections
    WHERE guild_id = ? AND user_id = ?
  `).get(gid, uid);

  const playerRow = db.prepare(`
    SELECT created_at
    FROM pokemon_players
    WHERE guild_id = ? AND user_id = ?
  `).get(gid, uid) || {};

  const recentCards = db.prepare(`
    SELECT
      c.card_id,
      c.rarity,
      c.is_shiny,
      c.acquired_at,
      s.name AS pokemon_name,
      s.artwork_url
    FROM pokemon_cards c
    JOIN pokemon_species s ON s.species_id = c.species_id
    WHERE c.guild_id = ? AND c.user_id = ?
    ORDER BY c.acquired_at DESC, c.card_id ASC
    LIMIT 3
  `).all(gid, uid);

  return {
    ...stats,
    unique_discovered: Number(uniqueRow?.count || 0),
    cards_owned: Number(cardBreakdown.total || 0),
    common_cards: Number(cardBreakdown.common_count || 0),
    rare_cards: Number(cardBreakdown.rare_count || 0),
    mythical_cards: Number(cardBreakdown.mythical_count || 0),
    shiny_cards: Number(cardBreakdown.shiny_count || 0),
    collections: Number(collectionsRow?.count || 0),
    created_at: Number(playerRow.created_at || 0),
    recent_cards: recentCards,
  };
}

function getLeaderboard(guildId, type = 'cards', limit = 10) {
  const gid = String(guildId || '');
  const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(limit) || 10)));

  const queries = {
    cards: `
      SELECT user_id, COUNT(*) AS score
      FROM pokemon_cards
      WHERE guild_id = ?
      GROUP BY user_id
      ORDER BY score DESC, user_id ASC
      LIMIT ?
    `,
    mythical: `
      SELECT user_id, COUNT(*) AS score
      FROM pokemon_cards
      WHERE guild_id = ? AND rarity = 'mythical'
      GROUP BY user_id
      ORDER BY score DESC, user_id ASC
      LIMIT ?
    `,
    unique: `
      SELECT user_id, COUNT(*) AS score
      FROM pokemon_pokedex
      WHERE guild_id = ?
      GROUP BY user_id
      ORDER BY score DESC, user_id ASC
      LIMIT ?
    `,
    collections: `
      SELECT user_id, COUNT(*) AS score
      FROM pokemon_collections
      WHERE guild_id = ?
      GROUP BY user_id
      ORDER BY score DESC, user_id ASC
      LIMIT ?
    `,
  };

  const sql = queries[type] || queries.cards;
  return db.prepare(sql).all(gid, safeLimit);
}

function getQuests(guildId, userId, now = Date.now()) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);

  ensurePlayer(gid, uid, now);

  return QUESTS.map(quest => {
    const key = periodKey(quest.scope, now);
    const row = db.prepare(`
      SELECT progress, claimed_at
      FROM pokemon_quest_progress
      WHERE guild_id = ? AND user_id = ? AND quest_id = ? AND period_key = ?
    `).get(gid, uid, quest.id, key);

    const progress = Number(row?.progress || 0);

    return {
      ...quest,
      progress: Math.min(quest.target, progress),
      claimed: Boolean(row?.claimed_at),
      completed: progress >= quest.target,
    };
  });
}

function claimQuest(guildId, userId, questId, now = Date.now()) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);
  const quest = QUESTS.find(item => item.id === String(questId));

  if (!quest) {
    return { ok: false, code: 'unknown_quest' };
  }

  ensurePlayer(gid, uid, now);

  const key = periodKey(quest.scope, now);

  const transaction = db.transaction(() => {
    const row = db.prepare(`
      SELECT progress, claimed_at
      FROM pokemon_quest_progress
      WHERE guild_id = ? AND user_id = ? AND quest_id = ? AND period_key = ?
    `).get(gid, uid, quest.id, key);

    if (!row || Number(row.progress) < quest.target) {
      throw new Error('NOT_COMPLETE');
    }

    if (row.claimed_at) {
      throw new Error('ALREADY_CLAIMED');
    }

    db.prepare(`
      UPDATE pokemon_quest_progress
      SET claimed_at = ?
      WHERE guild_id = ? AND user_id = ? AND quest_id = ? AND period_key = ?
    `).run(now, gid, uid, quest.id, key);

    stmt.addPack.run(gid, uid, quest.rewardType, quest.rewardAmount);
  });

  try {
    transaction();

    return {
      ok: true,
      quest,
      balances: getPackBalances(gid, uid),
    };
  } catch (error) {
    if (error.message === 'NOT_COMPLETE') {
      return { ok: false, code: 'not_complete' };
    }

    if (error.message === 'ALREADY_CLAIMED') {
      return { ok: false, code: 'already_claimed' };
    }

    throw error;
  }
}

function claimDaily(guildId, userId, now = Date.now()) {
  const { gid, uid } = normalizeGuildUser(guildId, userId);

  ensurePlayer(gid, uid, now);

  const day = dateKeyUTC6(now);
  const rewards = [
    { type: 'common', amount: 1, weight: 70 },
    { type: 'common', amount: 2, weight: 10 },
    { type: 'rare', amount: 1, weight: 15 },
    { type: 'mythical', amount: 1, weight: 5 },
  ];

  const roll = crypto.randomInt(100);
  let cursor = 0;
  let reward = rewards[0];

  for (const item of rewards) {
    cursor += item.weight;

    if (roll < cursor) {
      reward = item;
      break;
    }
  }

  const transaction = db.transaction(() => {
    const existing = db.prepare(`
      SELECT 1
      FROM pokemon_daily_claims
      WHERE guild_id = ? AND user_id = ? AND day_key = ?
    `).get(gid, uid, day);

    if (existing) {
      throw new Error('ALREADY_CLAIMED');
    }

    db.prepare(`
      INSERT INTO pokemon_daily_claims
        (guild_id, user_id, day_key, claimed_at, reward_type, reward_amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(gid, uid, day, now, reward.type, reward.amount);

    stmt.addPack.run(gid, uid, reward.type, reward.amount);
  });

  try {
    transaction();

    return {
      ok: true,
      reward,
      balances: getPackBalances(gid, uid),
    };
  } catch (error) {
    if (error.message === 'ALREADY_CLAIMED') {
      return { ok: false, code: 'already_claimed' };
    }

    throw error;
  }
}

function setupShopProduct(guildId, itemId, packType) {
  const gid = String(guildId || '');
  const id = String(itemId || '').trim();
  const type = normalizePackType(packType);

  if (!gid || !id || !PACK_TYPES.includes(type)) {
    return false;
  }

  try {
    db.prepare(`
      INSERT INTO pokemon_shop_products
        (guild_id, item_id, pack_type, created_at)
      VALUES (?, ?, ?, ?)
    `).run(gid, id, type, Date.now());

    return true;
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error.message)) {
      return false;
    }

    throw error;
  }
}

function getShopProduct(guildId, itemId) {
  return db.prepare(`
    SELECT *
    FROM pokemon_shop_products
    WHERE guild_id = ? AND item_id = ?
  `).get(String(guildId), String(itemId)) || null;
}

function getShopProductByType(guildId, packType) {
  const type = normalizePackType(packType);
  if (!PACK_TYPES.includes(type)) return null;

  return db.prepare(`
    SELECT *
    FROM pokemon_shop_products
    WHERE guild_id = ? AND pack_type = ?
  `).get(String(guildId), type) || null;
}

function replaceShopProductMappings(guildId, mappings) {
  const gid = String(guildId || '');
  if (!gid) throw new Error('A server is required to map Pokémon shop products.');
  if (!Array.isArray(mappings)) throw new TypeError('Shop product mappings must be an array.');

  const transaction = db.transaction(() => {
    db.prepare(`
      DELETE FROM pokemon_shop_products
      WHERE guild_id = ?
    `).run(gid);

    const insert = db.prepare(`
      INSERT INTO pokemon_shop_products
        (guild_id, item_id, pack_type, created_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const mapping of mappings) {
      if (!mapping) continue;

      const itemId = String(mapping.itemId ?? mapping.item_id ?? '').trim();
      const packType = normalizePackType(mapping.packType ?? mapping.pack_type);

      if (!itemId || !PACK_TYPES.includes(packType)) continue;

      insert.run(gid, itemId, packType, Date.now());
    }
  });

  transaction();
  return true;
}

function creditShopPurchase({
  purchaseId,
  guildId,
  userId,
  itemId,
  packType,
  amount = 1,
  now = Date.now(),
} = {}) {
  const gid = String(guildId || '');
  const uid = String(userId || '');
  const id = String(itemId || '').trim();
  const type = normalizePackType(packType);
  const quantity = Math.floor(Number(amount));

  if (
    !purchaseId ||
    !gid ||
    !uid ||
    !id ||
    !PACK_TYPES.includes(type) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 10000
  ) {
    return { ok: false, code: 'invalid_purchase' };
  }

  const transaction = db.transaction(() => {
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO pokemon_purchase_log
        (purchase_id, guild_id, user_id, item_id, pack_type, amount, purchased_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(purchaseId),
      gid,
      uid,
      id,
      type,
      quantity,
      now
    );

    if (!inserted.changes) {
      return false;
    }

    ensurePlayer(gid, uid, now);
    stmt.addPack.run(gid, uid, type, quantity);

    return true;
  });

  const credited = transaction();

  return credited
    ? { ok: true, balances: getPackBalances(gid, uid) }
    : { ok: false, code: 'duplicate_purchase' };
}

function grantEventReward(guildId, userId, packType, amount = 1) {
  return addPacks(guildId, userId, packType, amount);
}

function buildExpiredSessionReply(interaction) {
  if (interaction.replied || interaction.deferred) return;

  return interaction.reply({
    content: 'This pack display has expired. Open another pack to view your cards.',
    ephemeral: true,
  }).catch(() => {});
}

async function handleBrowseInteraction(interaction, customId) {
  const parts = customId.split(':');
  const sessionId = parts[2];
  const action = parts[3];
  const session = browseSessions.get(sessionId);

  if (!session || Date.now() > session.expiresAt) {
    browseSessions.delete(sessionId);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'This Pokémon page has expired. Run the command again to open a fresh one.',
        ephemeral: true,
      }).catch(() => {});
    }
    return;
  }

  if (
    String(interaction.user.id) !== session.userId ||
    String(interaction.guildId || '') !== session.guildId
  ) {
    await interaction.reply({
      content: 'Only the player who opened this Pokémon display can use these buttons.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  if (action === 'close') {
    browseSessions.delete(sessionId);
    await interaction.update({ components: [] }).catch(() => {});
    return;
  }

  if (!['first', 'prev', 'next', 'last'].includes(action)) {
    await interaction.reply({
      content: 'That pagination button is not valid.',
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  try {
    const {
      buildInventoryEmbed,
      buildPokedexEmbed,
      buildBrowseButtons,
    } = require('./pokemonEmbeds');

    let result;
    let embed;

    if (session.kind === 'inventory') {
      const options = {
        ...(session.filters || {}),
        limit: session.limit || 10,
        page: 1,
      };
      const firstPage = getInventory(session.guildId, session.targetId, options);
      const pages = Math.max(1, firstPage.pages);

      if (action === 'first') session.page = 1;
      else if (action === 'last') session.page = pages;
      else if (action === 'prev') session.page = Math.max(1, session.page - 1);
      else if (action === 'next') session.page = Math.min(pages, session.page + 1);

      session.page = Math.min(Math.max(1, session.page), pages);
      result = session.page === 1
        ? firstPage
        : getInventory(session.guildId, session.targetId, {
            ...(session.filters || {}),
            limit: session.limit || 10,
            page: session.page,
          });

      embed = buildInventoryEmbed(
        result,
        session.title,
        session.rarity,
        session.avatarURL
      );
    } else if (session.kind === 'pokedex') {
      const firstPage = getPokedex(
        session.guildId,
        session.targetId,
        session.generation,
        1,
        session.limit || 20
      );
      const pages = Math.max(1, firstPage.pages);

      if (action === 'first') session.page = 1;
      else if (action === 'last') session.page = pages;
      else if (action === 'prev') session.page = Math.max(1, session.page - 1);
      else if (action === 'next') session.page = Math.min(pages, session.page + 1);

      session.page = Math.min(Math.max(1, session.page), pages);
      result = session.page === 1
        ? firstPage
        : getPokedex(
            session.guildId,
            session.targetId,
            session.generation,
            session.page,
            session.limit || 20
          );

      embed = buildPokedexEmbed(result, session.generation);
    } else {
      browseSessions.delete(sessionId);
      await interaction.update({ components: [] }).catch(() => {});
      return;
    }

    session.expiresAt = Date.now() + 5 * 60 * 1000;
    await interaction.update({
      embeds: [embed],
      components: [buildBrowseButtons(sessionId, result.page, result.pages)],
    });
  } catch (error) {
    console.error('[Pokémon] Browse pagination failed:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'I could not update this Pokémon page. Please run the command again.',
        ephemeral: true,
      }).catch(() => {});
    }
  }
}

function init(client) {
  if (!client) return module.exports;

  client.pokemonDB = db;
  client.pokemon = module.exports;

  if (client._pokemonInteractionHandler) {
    return module.exports;
  }

  client._pokemonInteractionHandler = true;

  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const customId = String(interaction.customId || '');

    if (customId.startsWith('pokemon:browse:')) {
      await handleBrowseInteraction(interaction, customId);
      return;
    }

    if (!customId.startsWith('pokemon:pack:')) return;

    const parts = customId.split(':');
    const sessionId = parts[2];
    const action = parts[3];
    const session = sessions.get(sessionId);

    if (!session || Date.now() > session.expiresAt) {
      sessions.delete(sessionId);
      await buildExpiredSessionReply(interaction);
      return;
    }

    if (
      String(interaction.user.id) !== session.userId ||
      String(interaction.guildId || '') !== session.guildId
    ) {
      await interaction.reply({
        content: 'Only the player who opened this pack in this server can use these buttons.',
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    if (action === 'close') {
      sessions.delete(sessionId);
      await interaction.update({ components: [] }).catch(() => {});
      return;
    }

    if (action !== 'next' && action !== 'prev') {
      await interaction.reply({
        content: 'That pack button is not valid.',
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    if (!Array.isArray(session.cards) || session.cards.length === 0) {
      sessions.delete(sessionId);
      await interaction.update({ components: [] }).catch(() => {});
      return;
    }

    if (action === 'next') {
      session.index = (session.index + 1) % session.cards.length;
    } else {
      session.index = (session.index - 1 + session.cards.length) % session.cards.length;
    }

    try {
      const {
        buildCardEmbed,
        buildPackButtons,
      } = require('./pokemonEmbeds');

      await interaction.update({
        embeds: [
          buildCardEmbed(
            session.cards[session.index],
            session.index,
            session.cards.length,
            session.counts
          ),
        ],
        components: [buildPackButtons(sessionId)],
      });
    } catch (error) {
      console.error('[Pokémon] Pack pagination failed:', error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'I could not update this card display. Please open the pack again.',
          ephemeral: true,
        }).catch(() => {});
      }
    }
  });

  return module.exports;
}

function close() {
  sessions.clear();
  browseSessions.clear();
  activeOpenings.clear();

  if (db.open) {
    db.close();
  }
}

function createPackSession(guildId, userId, cards, counts) {
  if (!guildId || !userId) {
    throw new Error('A server and user are required to create a pack display.');
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('At least one card is required to create a pack display.');
  }

  const now = Date.now();

  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }

  const id = crypto.randomBytes(5).toString('hex');

  sessions.set(id, {
    guildId: String(guildId),
    userId: String(userId),
    cards,
    counts: counts || { common: 0, rare: 0, mythical: 0 },
    index: 0,
    expiresAt: now + 5 * 60 * 1000,
  });

  return id;
}

function createBrowseSession(guildId, userId, options = {}) {
  if (!guildId || !userId) {
    throw new Error('A server and user are required to create a Pokémon browse session.');
  }

  const kind = String(options.kind || '');
  if (!['inventory', 'pokedex'].includes(kind)) {
    throw new Error('Unsupported Pokémon browse session type.');
  }

  const now = Date.now();
  for (const [sessionId, session] of browseSessions.entries()) {
    if (session.expiresAt <= now) browseSessions.delete(sessionId);
  }

  const id = crypto.randomBytes(5).toString('hex');
  browseSessions.set(id, {
    kind,
    guildId: String(guildId),
    userId: String(userId),
    targetId: String(options.targetId || userId),
    title: String(options.title || 'Pokémon Inventory'),
    avatarURL: options.avatarURL || null,
    rarity: options.rarity || null,
    filters: options.filters || {},
    generation: options.generation || null,
    limit: Math.max(1, Math.min(25, Math.floor(Number(options.limit) || (kind === 'pokedex' ? 20 : 10)))),
    page: Math.max(1, Math.floor(Number(options.page) || 1)),
    expiresAt: now + 5 * 60 * 1000,
  });

  return id;
}

module.exports = {
  db,
  init,
  close,

  PACK_TYPES,
  CARD_RARITY,
  PACK_DROP_RATES,
  SHINY_CHANCE_DENOMINATOR,
  BURN_REWARDS,
  OPEN_COOLDOWN_MS,
  CARDS_PER_PACK,
  MAX_COLLECTIONS_CARDS,
  QUESTS,

  ensurePlayer,
  getPackBalances,
  addPacks,
  openPack,
  getInventory,
  getCard,
  giftCards,
  burnCards,

  createCollection,
  getCollection,
  listCollections,
  deleteCollection,
  addCardToCollection,
  removeCardFromCollection,
  setCollectionHex,
  getCollectionDisplay,

  getPokedex,
  getPlayerStats,
  getLeaderboard,
  getQuests,
  claimQuest,
  claimDaily,

  setupShopProduct,
  getShopProduct,
  getShopProductByType,
  replaceShopProductMappings,
  creditShopPurchase,
  grantEventReward,
  createPackSession,
  createBrowseSession,
};
