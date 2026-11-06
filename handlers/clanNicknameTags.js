'use strict';

// Keeps a member's clan tag at the end of their server nickname.
// Uses the same economy.sqlite connection as clanService.

const { PermissionFlagsBits } = require('discord.js');
const economy = require('./economy');

const db = economy.db;
if (!db || typeof db.prepare !== 'function') {
  throw new Error('[Clan Nicknames] economy.db is unavailable.');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS clan_nickname_tags (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    base_nickname TEXT NOT NULL,
    was_null INTEGER NOT NULL DEFAULT 0,
    tag TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
`);

const getTagRecord = db.prepare(`
  SELECT base_nickname, was_null, tag
  FROM clan_nickname_tags
  WHERE guild_id = ? AND user_id = ?
`);

const saveTagRecord = db.prepare(`
  INSERT INTO clan_nickname_tags
    (guild_id, user_id, base_nickname, was_null, tag, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET
    base_nickname = excluded.base_nickname,
    was_null = excluded.was_null,
    tag = excluded.tag,
    updated_at = excluded.updated_at
`);

const deleteTagRecord = db.prepare(`
  DELETE FROM clan_nickname_tags
  WHERE guild_id = ? AND user_id = ?
`);

const SUPERSCRIPT = Object.freeze({
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ',
  i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ',
  q: 'ᑫ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ',
  y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', C: 'ᶜ', D: 'ᴰ', E: 'ᴱ', F: 'ᶠ', G: 'ᴳ', H: 'ᴴ',
  I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ', N: 'ᴺ', O: 'ᴼ', P: 'ᴾ',
  Q: 'ᑫ', R: 'ᴿ', S: 'ˢ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ', X: 'ˣ',
  Y: 'ʸ', Z: 'ᶻ',
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
});

function makeClanTag(clanName) {
  const raw = String(clanName || '').trim();
  const compact = raw.replace(/\s+/g, '');
  const converted = Array.from(compact)
    .map(char => SUPERSCRIPT[char] || char)
    .join('');

  // Preserve non-Latin clan names instead of producing an empty suffix.
  return converted || raw.slice(0, 16) || 'Clan';
}

function displayName(member) {
  return member.nickname || member.user.globalName || member.user.username;
}

async function applyNickname(member, nickname) {
  const current = member.nickname;
  if (current === nickname) return true;

  const botMember = member.guild.members.me;
  const canManageNicknames = Boolean(
    botMember?.permissions?.has(PermissionFlagsBits.ManageNicknames)
  );

  if (!canManageNicknames || !member.manageable) {
    console.warn(
      `[Clan Nicknames] Cannot edit ${member.user.tag} in ${member.guild.name}. ` +
      'Check Manage Nicknames and role hierarchy.'
    );
    return false;
  }

  try {
    await member.setNickname(
      nickname,
      'Synchronizing the member nickname with their clan'
    );
    return true;
  } catch (error) {
    console.error(
      `[Clan Nicknames] Failed to update ${member.user.tag} in ${member.guild.name}:`,
      error
    );
    return false;
  }
}

async function performSync(member, clanService) {
  if (!member?.guild || !member?.user || member.user.bot) return false;

  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const record = getTagRecord.get(guildId, userId);
  const membership = clanService.getMembership(guildId, userId);
  const current = displayName(member);

  // No longer in a clan: remove only the suffix this handler previously added.
  if (!membership) {
    if (!record) return false;

    if (current.endsWith(record.tag)) {
      const restored = record.was_null ? null : record.base_nickname;
      await applyNickname(member, restored);
    }

    deleteTagRecord.run(guildId, userId);
    return true;
  }

  const nextTag = makeClanTag(membership.clan.name);
  let baseNickname = current;
  let wasNull = false;

  if (record && member.nickname && current.endsWith(record.tag)) {
    // Existing tagged nickname; preserve the original base when the clan is renamed.
    baseNickname = current.slice(0, -record.tag.length);
    wasNull = Boolean(record.was_null);
  } else if (member.nickname && current.endsWith(nextTag)) {
    // Recovery case: a tag is already present but the saved row is missing/outdated.
    baseNickname = current.slice(0, -nextTag.length);
    wasNull = record ? Boolean(record.was_null) : false;
  } else {
    // The member changed their nickname. Treat the new value as the new base name.
    baseNickname = current;
    wasNull = false;
    if (!record) wasNull = !member.nickname;
  }

  if (!baseNickname) {
    baseNickname = member.user.globalName || member.user.username;
    wasNull = false;
  }

  // Discord nicknames have a 32-character limit. Keep the full clan suffix,
  // shortening the base nickname only when the combined value is too long.
  const maxBaseLength = Math.max(0, 32 - nextTag.length);
  const targetNickname = `${Array.from(baseNickname).slice(0, maxBaseLength).join('')}${nextTag}`;

  saveTagRecord.run(
    guildId,
    userId,
    baseNickname,
    wasNull ? 1 : 0,
    nextTag,
    Date.now()
  );

  return applyNickname(member, targetNickname);
}

// Serialize edits per member so a fast leave/rejoin or rename cannot race
// two nickname updates against each other.
const pending = new Map();

function serialize(guildId, userId, operation) {
  const key = `${guildId}:${userId}`;
  const previous = pending.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  pending.set(key, next);

  return next.finally(() => {
    if (pending.get(key) === next) pending.delete(key);
  });
}

function syncMember(member, clanService) {
  if (!member?.guild || !member?.id) return Promise.resolve(false);
  return serialize(member.guild.id, member.id, async () => {
    const latest = member.guild.members.cache.get(member.id) || member;
    return performSync(latest, clanService);
  });
}

function syncUser(client, guildId, userId, clanService) {
  return serialize(guildId, userId, async () => {
    const guild = client.guilds.cache.get(String(guildId));
    if (!guild) return false;

    const member = guild.members.cache.get(String(userId)) ||
      await guild.members.fetch(String(userId)).catch(() => null);
    if (!member) return false;

    return performSync(member, clanService);
  });
}

async function syncGuild(guild, clanService) {
  let members;
  try {
    members = await guild.members.fetch();
  } catch (error) {
    console.error(
      `[Clan Nicknames] Could not fetch members in ${guild.name}:`,
      error
    );
    return;
  }

  for (const member of members.values()) {
    await syncMember(member, clanService).catch(error => {
      console.error('[Clan Nicknames] Member sync failed:', error);
    });
  }
}

async function init(client, clanService) {
  if (client._clanNicknameTagsReady) return client.clanNicknameTags;
  client._clanNicknameTagsReady = true;

  client.clanNicknameTags = {
    syncMember: member => syncMember(member, clanService),
    syncUser: (guildId, userId) => syncUser(client, guildId, userId, clanService),
    syncGuild: guild => syncGuild(guild, clanService),
  };

  client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
      client.clanNicknameTags.syncMember(newMember).catch(error => {
        console.error('[Clan Nicknames] Nickname update handler failed:', error);
      });
    }
  });

  client.on('guildMemberAdd', member => {
    client.clanNicknameTags.syncMember(member).catch(error => {
      console.error('[Clan Nicknames] New member sync failed:', error);
    });
  });

  client.on('guildMemberRemove', member => {
    deleteTagRecord.run(String(member.guild.id), String(member.id));
  });

  // Reconcile periodic inactivity kicks and clan deletions, which may not
  // produce a nickname event of their own.
  client._clanNicknameSyncInterval = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      syncGuild(guild, clanService).catch(error => {
        console.error('[Clan Nicknames] Periodic guild sync failed:', error);
      });
    }
  }, 15 * 60 * 1000);
  client._clanNicknameSyncInterval.unref?.();

  // This also applies tags to existing clan members when the feature is first enabled.
  for (const guild of client.guilds.cache.values()) {
    await syncGuild(guild, clanService);
  }

  console.log('[Clan Nicknames] Nickname synchronization initialized.');
  return client.clanNicknameTags;
}

function close(client = null) {
  if (client?._clanNicknameSyncInterval) {
    clearInterval(client._clanNicknameSyncInterval);
    client._clanNicknameSyncInterval = null;
  }
}

module.exports = { init, makeClanTag, close };
