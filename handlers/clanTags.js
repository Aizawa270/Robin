
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
// DATABASE HELPERS
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

// Existing clans receive enabled tags on the first migration.
// Existing stored settings are never overwritten.

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

// Persistent original nickname tracking.

db.exec(`
  CREATE TABLE IF NOT EXISTS clan_tag_nicknames (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    clan_id INTEGER NOT NULL,
    original_nickname TEXT,
    applied_nickname TEXT,
    applied_tag TEXT,
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

// Upgrade an older tracking table safely.

addColumn(
  'clan_tag_nicknames',
  'applied_tag TEXT'
);

// ============================================================
// PREPARED STATEMENTS
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
      applied_tag,
      updated_at
    )

    VALUES (?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(guild_id, user_id)

    DO UPDATE SET
      clan_id = excluded.clan_id,
      original_nickname = excluded.original_nickname,
      applied_nickname = excluded.applied_nickname,
      applied_tag = excluded.applied_tag,
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
// CLAN ERROR
// ============================================================

function clanError(message) {
  const error = new Error(message);
  error.name = 'ClanError';
  return error;
}

// ============================================================
// SMALL CAPITAL / SUPERSCRIPT LETTERS
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

// ============================================================
// TEXT NORMALIZATION
// ============================================================

function normalizeLetters(value) {
  return Array.from(
    String(value || '')
      .normalize('NFKD')
      .toLowerCase()
  ).filter(char => /\p{L}/u.test(char));
}

// ============================================================
// FORMAT TAG
// ============================================================

function formatTag(value) {
  const letters = normalizeLetters(value);

  if (!letters.length) {
    return '';
  }

  return letters.map((letter, index) => {
    if (index === 0) {
      return (
        UPPER[letter] ||
        LOWER[letter] ||
        letter
      );
    }

    return LOWER[letter] || letter;
  }).join('');
}

// ============================================================
// BUILD CLAN TAG
// ============================================================

// IMPORTANT:
// An alias REPLACES the full clan name.
// It is never appended to the normal clan tag.

function buildClanTag(clanRow) {
  if (!clanRow) {
    return '';
  }

  const source = String(
    clanRow.tag_alias || clanRow.name || ''
  ).trim();

  return formatTag(source);
}

// ============================================================
// KNOWN TAG SUFFIXES
// ============================================================

function getKnownTagSuffixes(clanRow, previous = null) {
  const candidates = [];

  if (previous?.applied_tag) {
    candidates.push(
      String(previous.applied_tag)
    );
  }

  // Current alias.
  if (clanRow?.tag_alias) {
    candidates.push(
      formatTag(clanRow.tag_alias)
    );
  }

  // Full clan name is included as a fallback.
  // This also recognizes older tags applied before
  // the alias system was introduced.

  if (clanRow?.name) {
    candidates.push(
      formatTag(clanRow.name)
    );
  }

  return [
    ...new Set(
      candidates.filter(Boolean)
    ),
  ].sort(
    (a, b) => Array.from(b).length - Array.from(a).length
  );
}

// ============================================================
// REMOVE A KNOWN TAG SUFFIX
// ============================================================

function stripKnownTag(nickname, clanRow, previous = null) {
  if (nickname === null || nickname === undefined) {
    return nickname;
  }

  const current = String(nickname);

  const suffixes = getKnownTagSuffixes(
    clanRow,
    previous
  );

  for (const suffix of suffixes) {
    if (current.endsWith(suffix)) {
      const base = current.slice(
        0,
        current.length - suffix.length
      );

      return base || null;
    }
  }

  return nickname;
}

// ============================================================
// GET ORIGINAL NICKNAME
// ============================================================

function getOriginalNickname(
  member,
  clanRow,
  previous
) {
  const current = member.nickname;

  if (previous) {
    // Best case:
    // The current nickname exactly matches what Vanessa
    // previously applied. Use the saved original.

    if (
      previous.applied_nickname !== null &&
      previous.applied_nickname !== undefined &&
      current === previous.applied_nickname
    ) {
      return previous.original_nickname;
    }

    // The member may have manually changed the base
    // nickname while retaining the clan tag.
    // Remove the tag but preserve their edited base.

    const stripped = stripKnownTag(
      current,
      clanRow,
      previous
    );

    if (stripped !== current) {
      return stripped;
    }

    // No recognizable old tag:
    // treat the current nickname as the new original.
    return current;
  }

  // Legacy support:
  // A tag may already be present from an older version
  // even though no tracking record exists yet.

  return stripKnownTag(
    current,
    clanRow
  );
}

// ============================================================
// VALIDATE ALIAS
// ============================================================

function validateAlias(clanName, rawAlias) {
  const alias = String(
    rawAlias || ''
  ).trim();

  const requiredLength = Number(
    CFG.TAG_ALIAS_LENGTH || 3
  );

  const aliasLetters = normalizeLetters(alias);

  if (
    Array.from(alias).length !== requiredLength ||
    aliasLetters.length !== requiredLength ||
    !/^\p{L}+$/u.test(alias)
  ) {
    throw clanError(
      `A clan alias must contain exactly ${requiredLength} letters.`
    );
  }

  const clanLetters = new Set(
    normalizeLetters(clanName)
  );

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
// SET TAG ENABLED
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

// ============================================================
// SET CLAN ALIAS
// ============================================================

function setAlias(guildId, userId, rawAlias) {
  const found = requireClanOwner(
    guildId,
    userId
  );

  const alias = rawAlias === null
    ? null
    : validateAlias(
        found.name,
        rawAlias
      );

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
// FETCH GUILD
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

// ============================================================
// FETCH MEMBER
// ============================================================

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
// CHECK NICKNAME PERMISSIONS
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
// CREATE FINAL NICKNAME
// ============================================================

function createNickname(
  originalNickname,
  tag,
  fallbackUsername
) {
  const maxLength = Number(
    CFG.TAG_NICKNAME_MAX_LENGTH || 32
  );

  const base = originalNickname === null
    ? String(fallbackUsername || '')
    : String(originalNickname ?? '');

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
// SAVE TRACKING
// ============================================================

function saveTracking(
  guildId,
  userId,
  clanId,
  originalNickname,
  appliedNickname,
  appliedTag
) {
  S.saveTag.run(
    String(guildId),
    String(userId),
    Number(clanId),
    originalNickname,
    appliedNickname,
    appliedTag,
    Date.now()
  );
}

// ============================================================
// APPLY TAG
// ============================================================

async function applyTag(member, clanRow) {
  if (!member || !clanRow || member.user.bot) {
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

  // Always calculate the original from the tracked record
  // or strip an older known clan-tag suffix.
  const originalNickname = getOriginalNickname(
    member,
    clanRow,
    previous
  );

  // Alias takes priority over the full clan name.
  const tag = buildClanTag(clanRow);

  if (!tag) {
    return false;
  }

  const desiredNickname = createNickname(
    originalNickname,
    tag,
    member.user.username
  );

  // If the nickname is already correct, update tracking.
  if (currentNickname === desiredNickname) {
    saveTracking(
      guildId,
      userId,
      clanId,
      originalNickname,
      desiredNickname,
      tag
    );

    return true;
  }

  // Save the original before making an API request.
  // Keep the old applied data until the new nickname succeeds.
  saveTracking(
    guildId,
    userId,
    clanId,
    originalNickname,
    previous?.applied_nickname ?? null,
    previous?.applied_tag ?? null
  );

  const allowed = await canManageMember(member);

  if (!allowed) {
    return false;
  }

  try {
    await member.setNickname(
      desiredNickname,
      `Apply clan identity tag: ${clanRow.name}`
    );

    // Record the new tag only after Discord accepts it.
    saveTracking(
      guildId,
      userId,
      clanId,
      originalNickname,
      desiredNickname,
      tag
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
    // Keep the tracking record so a later sync can retry.
    return false;
  }

  const currentNickname = member.nickname;

  let nicknameToRestore = previous.original_nickname;

  const exactMatch =
    previous.applied_nickname !== null &&
    currentNickname === previous.applied_nickname;

  if (!exactMatch) {
    // If someone manually edited the base but retained
    // the clan tag, remove only the tag and preserve the edit.

    const clanRow = S.getClan.get(
      previous.clan_id,
      guildId
    );

    const stripped = stripKnownTag(
      currentNickname,
      clanRow,
      previous
    );

    if (stripped !== currentNickname) {
      nicknameToRestore = stripped;
    } else {
      // The member changed their nickname independently.
      // Preserve it rather than overwrite it.
      S.deleteTag.run(
        guildId,
        userId
      );

      return true;
    }
  }

  const allowed = await canManageMember(member);

  if (!allowed) {
    return false;
  }

  try {
    await member.setNickname(
      nicknameToRestore,
      'Remove clan identity tag'
    );

    S.deleteTag.run(
      guildId,
      userId
    );

    return true;

  } catch (error) {
    console.warn(
      `[ClanTags] Could not restore nickname for ${userId}:`,
      error.message
    );

    return false;
  }
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

  if (!found || Number(found.tag_enabled) !== 1) {
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

  // The clan was deleted.
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

  // Tags disabled: restore tracked members.
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

  // Restore records for users no longer in this clan.
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

  // Clean up stale tracking records.
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
        '[ClanTags] Synchronization failed:',
        error
      );
    });
  };

  if (client.isReady?.()) {
    synchronize();
  } else {
    client.once('ready', synchronize);
  }

  // Reapply tags if a clan member leaves and rejoins the server.
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

  // Periodic reconciliation.
  const interval = setInterval(
    synchronize,
    Number(
      CFG.TAG_SYNC_INTERVAL_MS ||
      30 * 60 * 1000
    )
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
  formatTag,
  buildClanTag,

  createNickname,
  getOriginalNickname,
  stripKnownTag,

  applyTag,
  restoreTag,

  syncMember,
  syncClan,
  syncAll,
};
