'use strict';

/**
 * Pokémon feature extensions for the existing pokemonService.
 * Keep this module next to pokemonService.js and load it from p.js.
 * The original service remains responsible for packs, cards and collections.
 */

const TYPES = Object.freeze([
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
  'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost',
  'dragon', 'dark', 'steel', 'fairy',
]);

function install(service) {
  if (!service || !service.db) {
    throw new Error('pokemonFeatures requires the existing pokemonService module.');
  }

  const db = service.db;
  if (service._vanessaPokemonFeaturesInstalled) return service.pokemonFeatures;

  db.exec(`
    CREATE TABLE IF NOT EXISTS pokemon_wishlists (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      species_id INTEGER NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, species_id),
      FOREIGN KEY (species_id) REFERENCES pokemon_species(species_id)
    );

    CREATE INDEX IF NOT EXISTS idx_pokemon_wishlists_owner
      ON pokemon_wishlists(guild_id, user_id, added_at DESC);
  `);

  const normalizeName = value => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');

  function findSpecies(name, limit = 8) {
    const clean = normalizeName(name);
    if (!clean) return [];

    return db.prepare(`
      SELECT species_id, name, generation, rarity, artwork_url, types
      FROM pokemon_species
      WHERE LOWER(name) = ?
         OR LOWER(name) LIKE ?
         OR LOWER(name) LIKE ?
      ORDER BY
        CASE WHEN LOWER(name) = ? THEN 0
             WHEN LOWER(name) LIKE ? THEN 1
             ELSE 2 END,
        species_id
      LIMIT ?
    `).all(
      clean,
      `${clean}%`,
      `%${clean}%`,
      clean,
      `${clean}%`,
      Math.max(1, Math.min(20, Number(limit) || 8))
    );
  }

  function getInventoryAdvanced(guildId, userId, options = {}) {
    const gid = String(guildId || '');
    const uid = String(userId || '');
    if (!gid || !uid) throw new Error('A server and user are required.');

    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const limit = Math.max(1, Math.min(20, Math.floor(Number(options.limit) || 10)));
    const rarity = options.rarity && service.PACK_TYPES.includes(String(options.rarity).toLowerCase())
      ? String(options.rarity).toLowerCase()
      : null;
    const type = TYPES.includes(String(options.type || '').toLowerCase())
      ? String(options.type).toLowerCase()
      : null;
    const generation = Number.isInteger(Number(options.generation)) &&
      Number(options.generation) >= 1 && Number(options.generation) <= 9
      ? Number(options.generation)
      : null;
    const search = String(options.search || '').trim().toLowerCase();

    const where = ['c.guild_id = ?', 'c.user_id = ?'];
    const params = [gid, uid];

    if (rarity) {
      where.push('c.rarity = ?');
      params.push(rarity);
    }
    if (type) {
      // `types` is a JSON string such as ["psychic","fairy"]. This avoids
      // relying on SQLite JSON extensions while matching whole type values.
      where.push('LOWER(s.types) LIKE ?');
      params.push(`%"${type}"%`);
    }
    if (generation) {
      where.push('s.generation = ?');
      params.push(generation);
    }
    if (search) {
      where.push('LOWER(s.name) LIKE ?');
      params.push(`%${search}%`);
    }

    const whereSql = where.join(' AND ');
    const total = Number(db.prepare(`
      SELECT COUNT(*) AS count
      FROM pokemon_cards c
      JOIN pokemon_species s ON s.species_id = c.species_id
      WHERE ${whereSql}
    `).get(...params)?.count || 0);

    const cards = db.prepare(`
      SELECT
        c.card_id,
        c.species_id,
        c.rarity,
        c.acquired_at,
        s.name AS pokemon_name,
        s.generation,
        s.artwork_url,
        s.types
      FROM pokemon_cards c
      JOIN pokemon_species s ON s.species_id = c.species_id
      WHERE ${whereSql}
      ORDER BY c.acquired_at DESC, c.card_id ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit);

    return {
      cards,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      filters: { rarity, type, generation, search },
    };
  }

  function getWhoHas(guildId, speciesId, limit = 10) {
    const gid = String(guildId || '');
    const sid = Number(speciesId);
    if (!gid || !Number.isInteger(sid) || sid <= 0) return [];

    return db.prepare(`
      SELECT
        user_id,
        COUNT(*) AS card_count,
        SUM(CASE WHEN rarity = 'common' THEN 1 ELSE 0 END) AS common_count,
        SUM(CASE WHEN rarity = 'rare' THEN 1 ELSE 0 END) AS rare_count,
        SUM(CASE WHEN rarity = 'mythical' THEN 1 ELSE 0 END) AS mythical_count
      FROM pokemon_cards
      WHERE guild_id = ? AND species_id = ?
      GROUP BY user_id
      ORDER BY card_count DESC, user_id ASC
      LIMIT ?
    `).all(gid, sid, Math.max(1, Math.min(25, Number(limit) || 10)));
  }

  function getWishlist(guildId, userId) {
    const gid = String(guildId || '');
    const uid = String(userId || '');
    if (!gid || !uid) return [];

    return db.prepare(`
      SELECT
        s.species_id,
        s.name,
        s.generation,
        s.rarity,
        s.artwork_url,
        w.added_at
      FROM pokemon_wishlists w
      JOIN pokemon_species s ON s.species_id = w.species_id
      WHERE w.guild_id = ? AND w.user_id = ?
      ORDER BY w.added_at ASC, s.species_id ASC
    `).all(gid, uid);
  }

  function addWishlist(guildId, userId, speciesId, now = Date.now()) {
    const gid = String(guildId || '');
    const uid = String(userId || '');
    const sid = Number(speciesId);
    if (!gid || !uid || !Number.isInteger(sid) || sid <= 0) {
      return { ok: false, code: 'invalid_input' };
    }

    const count = Number(db.prepare(`
      SELECT COUNT(*) AS count
      FROM pokemon_wishlists
      WHERE guild_id = ? AND user_id = ?
    `).get(gid, uid)?.count || 0);
    if (count >= 50) return { ok: false, code: 'wishlist_full' };

    try {
      db.prepare(`
        INSERT INTO pokemon_wishlists (guild_id, user_id, species_id, added_at)
        VALUES (?, ?, ?, ?)
      `).run(gid, uid, sid, now);
      return { ok: true };
    } catch (error) {
      if (/UNIQUE constraint failed/i.test(error.message)) {
        return { ok: false, code: 'already_added' };
      }
      throw error;
    }
  }

  function removeWishlist(guildId, userId, speciesId) {
    const result = db.prepare(`
      DELETE FROM pokemon_wishlists
      WHERE guild_id = ? AND user_id = ? AND species_id = ?
    `).run(String(guildId || ''), String(userId || ''), Number(speciesId));
    return result.changes
      ? { ok: true }
      : { ok: false, code: 'not_found' };
  }

  function resetPlayerData(guildId, userId) {
    const gid = String(guildId || '');
    const uid = String(userId || '');
    if (!gid || !uid) return { ok: false, code: 'invalid_user' };

    const transaction = db.transaction(() => {
      // Remove collection links first, then collections and cards. The shared
      // species cache and server shop configuration are intentionally kept.
      db.prepare(`
        DELETE FROM pokemon_collection_cards
        WHERE card_id IN (
          SELECT card_id FROM pokemon_cards WHERE guild_id = ? AND user_id = ?
        )
      `).run(gid, uid);
      db.prepare('DELETE FROM pokemon_collections WHERE guild_id = ? AND user_id = ?').run(gid, uid);
      db.prepare('DELETE FROM pokemon_cards WHERE guild_id = ? AND user_id = ?').run(gid, uid);
      db.prepare('DELETE FROM pokemon_pokedex WHERE guild_id = ? AND user_id = ?').run(gid, uid);
      db.prepare('DELETE FROM pokemon_pack_balances WHERE guild_id = ? AND user_id = ?').run(gid, uid);
      db.prepare('DELETE FROM pokemon_player_stats WHERE guild_id = ? AND user_id = ?').run(gid, uid);
      db.prepare('DELETE FROM pokemon_players WHERE guild_id = ? AND user_id = ?').run(gid, uid);
      db.prepare('DELETE FROM pokemon_open_cooldowns WHERE guild_id = ? AND user_id = ?').run(gid, uid);
      db.prepare('DELETE FROM pokemon_quest_progress WHERE guild_id = ? AND user_id = ?').run(gid, uid);
      db.prepare('DELETE FROM pokemon_daily_claims WHERE guild_id = ? AND user_id = ?').run(gid, uid);
      // Keep the purchase ledger: it prevents duplicate receipt events from
      // crediting packs twice and preserves the common-pack bonus milestone.
      db.prepare('DELETE FROM pokemon_wishlists WHERE guild_id = ? AND user_id = ?').run(gid, uid);
    });

    transaction();
    return { ok: true };
  }

  // Award the bonus from SQLite itself. This runs inside the same transaction
  // that inserts a successful purchase log row, including when another module
  // cached/destructured creditShopPurchase before this extension was loaded.
  // Duplicate purchase IDs are ignored by the existing purchase log INSERT,
  // so the trigger cannot award the same bonus twice.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS pokemon_common_pack_purchase_bonus
    AFTER INSERT ON pokemon_purchase_log
    WHEN LOWER(NEW.pack_type) = 'common'
    BEGIN
      INSERT OR IGNORE INTO pokemon_pack_balances
        (guild_id, user_id, pack_type, quantity)
      VALUES (NEW.guild_id, NEW.user_id, 'mythical', 0);

      UPDATE pokemon_pack_balances
      SET quantity = quantity + (
        SELECT MAX(
          0,
          2 * (
            CAST(COALESCE(SUM(amount), 0) / 10 AS INTEGER)
            - CAST((COALESCE(SUM(amount), 0) - NEW.amount) / 10 AS INTEGER)
          )
        )
        FROM pokemon_purchase_log
        WHERE guild_id = NEW.guild_id
          AND user_id = NEW.user_id
          AND LOWER(pack_type) = 'common'
      )
      WHERE guild_id = NEW.guild_id
        AND user_id = NEW.user_id
        AND pack_type = 'mythical';
    END;
  `);

  const features = {
    TYPES,
    findSpecies,
    getInventoryAdvanced,
    getWhoHas,
    getWishlist,
    addWishlist,
    removeWishlist,
    resetPlayerData,
  };

  service._vanessaPokemonFeaturesInstalled = true;
  service.pokemonFeatures = features;
  return features;
}

module.exports = install;
