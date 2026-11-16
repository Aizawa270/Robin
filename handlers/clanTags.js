'use strict';

const {
  PermissionFlagsBits,
} = require('discord.js');

const economy = require('./economy');
const CFG = require('./clanConfig');

const db = economy.db;

if (!db || typeof db.prepare !== 'function') {
  throw new Error(
    '[ClanTags] economy.db is unavailable.'
  );
}

// ============================================================
// DATABASE MIGRATION
// ============================================================

function addColumn(table, definition) {
  try {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${definition}`
    );

    return true;
  } catch {
    return false;
  }
}

// Existing clans receive TAG_DEFAULT_ENABLED = 1.
// Existing values are never overwritten.

addColumn(
  'clans',
  `tag_enabled INTEGER NOT NULL DEFAULT ${
    CFG.TAG_DEFAULT_ENABLED === false ? 0 : 1
  }`
);

addColumn(
  'clans',
  'tag_alias TEXT'
);

// Original nickname tracking.

db.exec(`
  CREATE TABLE IF NOT EXISTS clan_tag_nicknames (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    clan_id INTEGER NOT NULL,

    original_nickname TEXT,
    applied_nickname TEXT,

    updated_at INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (guild_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS
    idx_clan_tag_nicknames_clan

  ON clan_tag_nicknames (
    guild_id,
    clan_id
  );
`);

// ============================================================
// DATABASE STATEMENTS
// ============================================================

const S = {
  getClan: db.prepare(`
    SELECT *
    FROM clans
    WHERE id = ?
      AND guild_id = ?
    LIMIT 1
  `),

  getMembership: db.prepare(`
    SELECT
      c.*,
      m.rank_no

    FROM clan_members m

    JOIN clans c
      ON c.id = m.clan_id

    WHERE m.guild_id = ?
      AND m.user_id = ?

    LIMIT 1
  `),

  getMembers: db.prepare(`
    SELECT guild_id, user_id
    FROM clan_members
    WHERE clan_id = ?
      AND guild_id = ?
  `),

  getTag: db.prepare(`
    SELECT *
    FROM clan_tag_nicknames
    WHERE guild_id = ?
      AND user_id = ?
    LIMIT 1
  `),

  getTagsByClan: db.prepare(`
    SELECT *
    FROM clan_tag_nicknames
    WHERE guild_id = ?
      AND clan_id = ?
  `),

  getAllTags: db.prepare(`
    SELECT *
    FROM clan_tag_nicknames
  `),

  getAllClans: db.prepare(`
    SELECT *
    FROM clans
  `),

  saveTag: db.prepare(`
    INSERT INTO clan_tag_nicknames (
      guild_id,
      user_id,
      clan_id,
      original_nickname,
      applied_nickname,
      updated_at
    )

    VALUES (?, ?, ?, ?, ?, ?)

    ON CONFLICT(guild_id, user_id)

    DO UPDATE SET
      clan_id = excluded.clan_id,
      original_nickname = excluded.original_nickname,
      applied_nickname = excluded.applied_nickname,
      updated_at = excluded.updated_at
  `),

  deleteTag: db.prepare(`
    DELETE FROM clan_tag_nicknames
    WHERE guild_id = ?
      AND user_id = ?
  `),

  updateEnabled: db.prepare(`
    UPDATE clans
    SET tag_enabled = ?
    WHERE id = ?
      AND guild_id = ?
  `),

  updateAlias: db.prepare(`
    UPDATE clans
    SET tag_alias = ?
    WHERE id = ?
      AND guild_id = ?
  `),
};

// ============================================================
// ERRORS
// ============================================================

function clanError(message) {
  const error = new Error(message);
  error.name = 'ClanError';

  return error;
}

// ============================================================
// SMALL-CAPITAL / SUPERSCRIPT LETTERS
// ============================================================

const LOWER = {
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  f: 'ᶠ',
  g: 'ᵍ',
  h: 'ʰ',
  i: 'ⁱ',
  j: 'ʲ',
  k: 'ᵏ',
  l: 'ˡ',
  m: 'ᵐ',
  n: 'ⁿ',
  o: 'ᵒ',
  p: 'ᵖ',
  q: 'q',
  r: 'ʳ',
  s: 'ˢ',
  t: 'ᵗ',
  u: 'ᵘ',
  v: 'ᵛ',
  w: 'ʷ',
  x: 'ˣ',
  y: 'ʸ',
  z: 'ᶻ',
};

const UPPER = {
  a: 'ᴬ',
  b: 'ᴮ',
  d: 'ᴰ',
  e: 'ᴱ',
  g: 'ᴳ',
  h: 'ᴴ',
  i: 'ᴵ',
  j: 'ᴶ',
  k: 'ᴷ',
  l: 'ᴸ',
  m: 'ᴹ',
  n: 'ᴺ',
  o: 'ᴼ',
  p: 'ᴾ',
  r: 'ᴿ',
  t: 'ᵀ',
  u: 'ᵁ',
  v: 'ⱽ',
  w: 'ᵂ',
};

function normalizeLetters(value) {
  return Array.from(
    String(value || '')
      .normalize('NFKD')
      .toLowerCase()
  ).filter(char => /\p{L}/u.test(char));
}

function formatTag(value) {
  const letters = normalizeLetters(value);

  if (!letters.length) {
    return '';
  }

  return letters.map((letter, index) => {
    if (index === 0) {
      return UPPER[letter] || LOWER[letter] || letter;
    }

    return LOWER[letter] || letter;
  }).join('');
}

function buildClanTag(clanRow) {
  const source = String(
    clanRow.tag_alias || clanRow.name || ''
  );

  return formatTag(source);
}

// ============================================================
// ALIAS VALIDATION
// ============================================================

function validateAlias(clanName, rawAlias) {
  const alias = String(rawAlias || '').trim();

  const requiredLength = Number(
    CFG.TAG_ALIAS_LENGTH || 3
  );

  if (
    Array.from(alias).length !== requiredLength ||
    !/^\p{L}+$/u.test(alias)
  ) {
    throw clanError(
      `A clan alias must contain exactly ${requiredLength} letters.`
    );
  }

  const clanLetters = new Set(
    normalizeLetters(clanName)
  );

  const aliasLetters = normalizeLetters(alias);

  for (const letter of aliasLetters) {
    if (!clanLetters.has(letter)) {
      throw clanError(
        `The alias "${alias}" contains a letter that does not exist in your clan name.`
      );
    }
  }

  return alias;
}

// ============================================================
// OWNER PERMISSION
// ============================================================

function requireClanOwner(guildId, userId) {
  const found = S.getMembership.get(
    String(guildId),
    String(userId)
  );

  if (!found) {
    throw clanError(
      'You are not currently in a clan.'
    );
  }

  if (
    Number(found.rank_no) !== 5 ||
    String(found.owner_id) !== String(userId)
  ) {
    throw clanError(
      'Only the actual clan Owner can change clan tag settings.'
    );
  }

  return found;
}

// ============================================================
// SETTINGS
// ============================================================

function setEnabled(guildId, userId, enabled) {
  const found = requireClanOwner(
    guildId,
    userId
  );

  S.updateEnabled.run(
    enabled ? 1 : 0,
    found.id,
    String(guildId)
  );

  return S.getClan.get(
    found.id,
    String(guildId)
  );
}

function setAlias(guildId, userId, rawAlias) {
  const found = requireClanOwner(
    guildId,
    userId
  );

  const alias = rawAlias === null
    ? null
    : validateAlias(found.name, rawAlias);

  S.updateAlias.run(
    alias,
    found.id,
    String(guildId)
  );

  return S.getClan.get(
    found.id,
    String(guildId)
  );
}

// ============================================================
// DISCORD MEMBER FETCHING
// ============================================================

async function getGuild(client, guildId) {
  let guild = client.guilds.cache.get(
    String(guildId)
  );

  if (!guild) {
    guild = await client.guilds.fetch(
      String(guildId)
    ).catch(() => null);
  }

  return guild;
}

async function getMember(client, guildId, userId) {
  const guild = await getGuild(
    client,
    guildId
  );

  if (!guild) {
    return null;
  }

  let member = guild.members.cache.get(
    String(userId)
  );

  if (!member) {
    member = await guild.members.fetch(
      String(userId)
    ).catch(() => null);
  }

  return member;
}

// ============================================================
// PERMISSION CHECK
// ============================================================

async function canManageMember(member) {
  if (!member?.guild) {
    return false;
  }

  if (
    member.user.bot ||
    member.id === member.guild.members.me?.id
  ) {
    return false;
  }

  let botMember = member.guild.members.me;

  if (!botMember) {
    botMember = await member.guild.members
      .fetchMe()
      .catch(() => null);
  }

  if (!botMember) {
    return false;
  }

  if (
    !botMember.permissions.has(
      PermissionFlagsBits.ManageNicknames
    )
  ) {
    return false;
  }

  return member.manageable;
}

// ============================================================
// NICKNAME CONSTRUCTION
// ============================================================

function createNickname(originalNickname, tag) {
  const maxLength = Number(
    CFG.TAG_NICKNAME_MAX_LENGTH || 32
  );

  const base = originalNickname === null
    ? ''
    : String(originalNickname);

  const tagCharacters = Array.from(tag);
  const baseCharacters = Array.from(base);

  const allowedBaseLength = Math.max(
    0,
    maxLength - tagCharacters.length
  );

  const shortenedBase = baseCharacters
    .slice(0, allowedBaseLength)
    .join('');

  return shortenedBase + tag;
}

// ============================================================
// APPLY TAG
// ============================================================

async function applyTag(member, clanRow) {
  if (!member || !clanRow) {
    return false;
  }

  if (member.user.bot) {
    return false;
  }

  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const clanId = Number(clanRow.id);

  const currentNickname = member.nickname;

  const previous = S.getTag.get(
    guildId,
    userId
  );

  let originalNickname;

  if (!previous) {
    originalNickname = currentNickname;
  } else {
    const previousTagMatches =
      previous.applied_nickname !== null &&
      currentNickname === previous.applied_nickname;

    if (previousTagMatches) {
      // The existing nickname is still our own tag.
      // Keep the original nickname unchanged.
      originalNickname = previous.original_nickname;
    } else {
      // The member changed their nickname manually.
      // Use their current nickname as the new original.
      originalNickname = currentNickname;
    }
  }

  const tag = buildClanTag(clanRow);

  if (!tag) {
    return false;
  }

  const desiredNickname = createNickname(
    originalNickname === null
      ? member.user.username
      : originalNickname,
    tag
  );

  // Save the original BEFORE attempting the Discord update.
  // This prevents losing the original if the API request fails.

  S.saveTag.run(
    guildId,
    userId,
    clanId,
    originalNickname,
    previous?.applied_nickname ?? null,
    Date.now()
  );

  if (currentNickname === desiredNickname) {
    S.saveTag.run(
      guildId,
      userId,
      clanId,
      originalNickname,
      desiredNickname,
      Date.now()
    );

    return true;
  }

  const allowed = await canManageMember(member);

  if (!allowed) {
    return false;
  }

  try {
    await member.setNickname(
      desiredNickname,
      `Apply clan identity tag: ${clanRow.name}`
    );

    S.saveTag.run(
      guildId,
      userId,
      clanId,
      originalNickname,
      desiredNickname,
      Date.now()
    );

    return true;

  } catch (error) {
    console.warn(
      `[ClanTags] Could not apply tag to ${userId}:`,
      error.message
    );

    return false;
  }
}

// ============================================================
// RESTORE ORIGINAL NICKNAME
// ============================================================

async function restoreTag(
  client,
  guildId,
  userId,
  suppliedMember = null
) {
  guildId = String(guildId);
  userId = String(userId);

  const previous = S.getTag.get(
    guildId,
    userId
  );

  if (!previous) {
    return false;
  }

  const member = suppliedMember || await getMember(
    client,
    guildId,
    userId
  );

  if (!member) {
    // Keep the record so restoration can be retried.
    return false;
  }

  // Only restore if the nickname is still exactly
  // the nickname Vanessa applied.

  if (
    previous.applied_nickname !== null &&
    member.nickname === previous.applied_nickname
  ) {
    const allowed = await canManageMember(member);

    if (!allowed) {
      return false;
    }

    try {
      await member.setNickname(
        previous.original_nickname,
        'Remove clan identity tag'
      );

    } catch (error) {
      console.warn(
        `[ClanTags] Could not restore nickname for ${userId}:`,
        error.message
      );

      return false;
    }
  }

  // If the member manually changed their nickname,
  // leave that nickname untouched.

  S.deleteTag.run(
    guildId,
    userId
  );

  return true;
}

// ============================================================
// SYNC ONE MEMBER
// ============================================================

async function syncMember(client, guildId, userId) {
  guildId = String(guildId);
  userId = String(userId);

  const found = S.getMembership.get(
    guildId,
    userId
  );

  if (
    !found ||
    Number(found.tag_enabled) !== 1
  ) {
    return restoreTag(
      client,
      guildId,
      userId
    );
  }

  const member = await getMember(
    client,
    guildId,
    userId
  );

  if (!member) {
    return false;
  }

  return applyTag(
    member,
    found
  );
}

// ============================================================
// SYNC ONE CLAN
// ============================================================

async function syncClan(client, guildId, clanId) {
  guildId = String(guildId);
  clanId = Number(clanId);

  const clanRow = S.getClan.get(
    clanId,
    guildId
  );

  const tracked = S.getTagsByClan.all(
    guildId,
    clanId
  );

  // Clan was deleted.
  // Restore all remaining tracked members.

  if (!clanRow) {
    for (const row of tracked) {
      await restoreTag(
        client,
        guildId,
        row.user_id
      );
    }

    return {
      clanExists: false,
      processed: tracked.length,
    };
  }

  // Tags disabled: restore everybody.

  if (Number(clanRow.tag_enabled) !== 1) {
    for (const row of tracked) {
      await restoreTag(
        client,
        guildId,
        row.user_id
      );
    }

    return {
      enabled: false,
      processed: tracked.length,
    };
  }

  const members = S.getMembers.all(
    clanId,
    guildId
  );

  const activeIds = new Set(
    members.map(member => String(member.user_id))
  );

  let processed = 0;

  for (const member of members) {
    await syncMember(
      client,
      guildId,
      member.user_id
    );

    processed++;
  }

  // Restore anyone whose tracking record exists
  // but who is no longer in the clan.

  for (const row of tracked) {
    if (!activeIds.has(String(row.user_id))) {
      await restoreTag(
        client,
        guildId,
        row.user_id
      );
    }
  }

  return {
    enabled: true,
    processed,
  };
}

// ============================================================
// SYNC ALL CLANS
// ============================================================

async function syncAll(client) {
  const clans = S.getAllClans.all();

  for (const clanRow of clans) {
    await syncClan(
      client,
      clanRow.guild_id,
      clanRow.id
    );
  }

  // Clean up nickname records belonging to deleted clans
  // or members whose clan membership no longer exists.

  const remaining = S.getAllTags.all();

  for (const row of remaining) {
    const found = S.getMembership.get(
      row.guild_id,
      row.user_id
    );

    if (
      !found ||
      Number(found.tag_enabled) !== 1
    ) {
      await restoreTag(
        client,
        row.guild_id,
        row.user_id
      );
    }
  }

  return {
    clans: clans.length,
  };
}

// ============================================================
// INITIALIZATION
// ============================================================

function init(client) {
  if (!client || client._clanTagsInitialized) {
    return;
  }

  client._clanTagsInitialized = true;

  const synchronize = () => {
    syncAll(client).catch(error => {
      console.error(
        '[ClanTags] Initial synchronization failed:',
        error
      );
    });
  };

  if (client.isReady?.()) {
    synchronize();
  } else {
    client.once('ready', synchronize);
  }

  // Apply tags when a previous clan member rejoins the server.
  client.on('guildMemberAdd', member => {
    syncMember(
      client,
      member.guild.id,
      member.id
    ).catch(error => {
      console.error(
        '[ClanTags] Member join synchronization failed:',
        error
      );
    });
  });

  // Periodic reconciliation also catches missed changes.
  const interval = setInterval(
    synchronize,
    Number(CFG.TAG_SYNC_INTERVAL_MS || 30 * 60 * 1000)
  );

  interval.unref?.();

  client._clanTagSyncInterval = interval;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  init,

  setEnabled,
  setAlias,

  validateAlias,
  buildClanTag,

  syncMember,
  syncClan,
  syncAll,

  restoreTag,
};