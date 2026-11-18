'use strict';

const service = require('./pokemonService');

const API_BASE = 'https://pokeapi.co/api/v2';
const SPECIES_LIMIT = 1025; // National Pokédex species through Generation IX.
const CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 15000;

// These species are deliberately assigned the Rare game tier. All species
// flagged legendary or mythical by PokéAPI are assigned the Mythical game tier.
// Every other Generation I-IX species defaults to Common. Edit this list to
// tune the server's card economy without changing already-created cards.
const RARE_SPECIES_IDS = new Set([
  // Kanto
  3, 6, 9, 26, 31, 34, 45, 59, 62, 65, 68, 71, 76, 80, 89, 94, 103, 112,
  115, 121, 130, 131, 134, 135, 136, 142, 149, 154, 157, 160, 181, 182,
  184, 185, 196, 197, 199, 205, 208, 212, 214, 217, 221, 224, 226, 229,
  230, 233, 242,
  // Johto
  157, 160, 162, 171, 181, 184, 186, 195, 196, 197, 199, 203, 205, 208,
  212, 214, 217, 221, 224, 226, 229, 230, 232, 233, 237, 242,
  // Hoenn
  254, 257, 260, 267, 272, 275, 282, 284, 289, 295, 306, 308, 310, 319,
  321, 330, 334, 350, 354, 359, 362, 373, 376,
  // Sinnoh
  392, 395, 398, 405, 407, 409, 412, 413, 414, 416, 419, 421, 423, 424,
  426, 428, 430, 435, 442, 445, 448, 450, 452, 454, 461, 462, 464, 465,
  466, 467, 468, 469, 470, 471, 472, 473, 475, 476, 477, 478,
  // Unova
  497, 500, 503, 508, 510, 514, 516, 521, 523, 526, 530, 534, 538, 539,
  542, 545, 547, 549, 553, 556, 560, 563, 565, 567, 571, 573, 579, 581,
  584, 586, 591, 593, 594, 596, 598, 601, 604, 606, 609, 612, 614, 617,
  623, 625, 626, 628, 635, 637,
  // Kalos
  652, 655, 658, 663, 666, 668, 671, 673, 676, 678, 681, 689, 691, 693,
  695, 697, 699, 701, 702, 706, 707, 709, 711, 713, 715,
  // Alola
  724, 727, 730, 733, 735, 738, 740, 743, 745, 748, 750, 752, 754, 758,
  760, 763, 765, 766, 768, 773, 778, 781, 784, 787, 788, 791, 792,
  // Galar / Hisui
  815, 818, 823, 826, 839, 849, 858, 861, 865, 869, 879, 887, 898,
  // Paldea
  911, 914, 923, 934, 936, 937, 941, 949, 950, 959, 966, 977, 983,
  998, 1000,
]);

const GENERATION_NUMBER = Object.freeze({
  'generation-i': 1,
  'generation-ii': 2,
  'generation-iii': 3,
  'generation-iv': 4,
  'generation-v': 5,
  'generation-vi': 6,
  'generation-vii': 7,
  'generation-viii': 8,
  'generation-ix': 9,
});

function speciesRarity(species) {
  if (species.is_legendary || species.is_mythical) return 'mythical';
  return RARE_SPECIES_IDS.has(Number(species.id)) ? 'rare' : 'common';
}

function extractId(url) {
  const match = String(url || '').match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VanessaDiscordBot/1.0 (Pokémon collection feature)',
      },
    });
    if (!response.ok) throw new Error(`PokéAPI returned HTTP ${response.status} for ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, worker, concurrency) {
  let next = 0;
  const results = [];
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

async function syncSpecies(options = {}) {
  const force = Boolean(options.force);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const now = Date.now();
  onProgress({ stage: 'list', completed: 0, total: SPECIES_LIMIT });

  const listing = await fetchJson(`${API_BASE}/pokemon-species/?limit=${SPECIES_LIMIT}&offset=0`);
  if (!Array.isArray(listing.results) || listing.results.length < SPECIES_LIMIT) {
    throw new Error(`PokéAPI returned ${listing.results?.length || 0} species; expected at least ${SPECIES_LIMIT}.`);
  }

  const existingRows = service.db.prepare(
    'SELECT species_id, types FROM pokemon_species'
  ).all();
  const existing = new Map(existingRows.map(row => [
    Number(row.species_id),
    String(row.types || '[]'),
  ]));
  const queue = listing.results.slice(0, SPECIES_LIMIT).filter(item => {
    const id = extractId(item.url);
    if (!id || id > SPECIES_LIMIT) return false;
    if (force || !existing.has(id)) return true;
    // Backfill type data for species cached by the previous version.
    return !existing.get(id) || existing.get(id) === '[]';
  });

  let completed = 0;
  let inserted = 0;
  const failures = [];
  const upsert = service.db.prepare(`
    INSERT INTO pokemon_species (
      species_id,name,generation,rarity,is_legendary,is_mythical,
      pokemon_id,artwork_url,types,api_url,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(species_id) DO UPDATE SET
      name=excluded.name,
      generation=excluded.generation,
      rarity=excluded.rarity,
      is_legendary=excluded.is_legendary,
      is_mythical=excluded.is_mythical,
      pokemon_id=excluded.pokemon_id,
      artwork_url=excluded.artwork_url,
      types=excluded.types,
      api_url=excluded.api_url,
      updated_at=excluded.updated_at
  `);

  await runPool(queue, async item => {
    const species = await fetchJson(item.url);
    const speciesId = Number(species.id);
    const defaultPokemonUrl = species.varieties?.find(v => v.is_default)?.pokemon?.url;
    const pokemonId = extractId(defaultPokemonUrl) || speciesId;
    const generation = GENERATION_NUMBER[species.generation?.name];
    if (!generation || generation > 9 || speciesId < 1 || speciesId > SPECIES_LIMIT) {
      throw new Error(`Unsupported species/generation data for ID ${speciesId}.`);
    }
    const englishName = species.name
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    const artworkUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemonId}.png`;

    // The Pokémon endpoint includes its primary form's type(s), used for card themes.
    // If this secondary request fails, keep the species syncable and use the rarity colour.
    let types = [];
    if (defaultPokemonUrl) {
      try {
        const pokemonData = await fetchJson(defaultPokemonUrl);
        types = (pokemonData.types || [])
          .map(entry => String(entry?.type?.name || '').toLowerCase())
          .filter(Boolean)
          .slice(0, 2);
      } catch (typeError) {
        // Type data is cosmetic; a failed type lookup must not block Pokédex sync.
      }
    }

    upsert.run(
      speciesId,
      englishName,
      generation,
      speciesRarity(species),
      species.is_legendary ? 1 : 0,
      species.is_mythical ? 1 : 0,
      pokemonId,
      artworkUrl,
      JSON.stringify(types),
      item.url,
      Date.now() || now,
    );
    inserted++;
    completed++;
    if (completed % 20 === 0 || completed === queue.length) {
      onProgress({ stage: 'species', completed, total: queue.length, inserted });
    }
    return { ok: true };
  }, CONCURRENCY).then(results => {
    for (const result of results) {
      if (result && result.ok === false) failures.push(String(result.error?.message || result.error));
    }
  });

  const totalCached = Number(service.db.prepare('SELECT COUNT(*) AS count FROM pokemon_species').get().count);
  const byGeneration = service.db.prepare('SELECT generation,COUNT(*) AS count FROM pokemon_species GROUP BY generation ORDER BY generation').all();
  const byRarity = service.db.prepare('SELECT rarity,COUNT(*) AS count FROM pokemon_species GROUP BY rarity').all();
  return {
    ok: totalCached >= SPECIES_LIMIT && failures.length === 0,
    inserted,
    totalCached,
    failures,
    byGeneration,
    byRarity,
  };
}

function getSyncStatus() {
  const total = Number(service.db.prepare('SELECT COUNT(*) AS count FROM pokemon_species').get().count);
  const byGeneration = service.db.prepare('SELECT generation,COUNT(*) AS count FROM pokemon_species GROUP BY generation ORDER BY generation').all();
  const byRarity = service.db.prepare('SELECT rarity,COUNT(*) AS count FROM pokemon_species GROUP BY rarity').all();
  return { total, expected: SPECIES_LIMIT, ready: total >= SPECIES_LIMIT, byGeneration, byRarity };
}

module.exports = {
  API_BASE,
  SPECIES_LIMIT,
  RARE_SPECIES_IDS,
  syncSpecies,
  getSyncStatus,
  speciesRarity,
};
