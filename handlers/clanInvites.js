'use strict';

// Persistent clan invitations. Uses the same economy.sqlite connection as
// clanService so accepting an invitation and adding the member are atomic.
const crypto = require('crypto');
const economy = require('./economy');
const clanService = require('./clanService');
const CFG = require('./clanConfig');
const db = economy.db;

if (!db || typeof db.prepare !== 'function') {
  throw new Error('[Clan] economy.db is unavailable; initialize the economy handler first.');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS clan_invites (
    token TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    clan_id INTEGER NOT NULL,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  );
  CREATE INDEX IF NOT EXISTS idx_clan_invites_pending
    ON clan_invites (guild_id, invitee_id, status, expires_at);
`);

const getInvite = db.prepare('SELECT * FROM clan_invites WHERE token = ?');
const createStmt = db.prepare(`
  INSERT INTO clan_invites
    (token, guild_id, clan_id, inviter_id, invitee_id, created_at, expires_at, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
`);
const rejectStmt = db.prepare(`
  UPDATE clan_invites SET status = 'rejected'
  WHERE token = ? AND invitee_id = ? AND status = 'pending'
`);
const expireStmt = db.prepare(`
  UPDATE clan_invites SET status = 'expired'
  WHERE token = ? AND status = 'pending'
`);
const pruneStmt = db.prepare(`
  DELETE FROM clan_invites WHERE status <> 'pending' OR expires_at <= ?
`);

function create(guildId, clanId, inviterId, inviteeId, now = Date.now()) {
  const token = crypto.randomBytes(9).toString('hex');
  const expiresAt = now + CFG.INVITE_TIMEOUT_MS;
  createStmt.run(
    token,
    String(guildId),
    Number(clanId),
    String(inviterId),
    String(inviteeId),
    Number(now),
    Number(expiresAt)
  );
  return { token, expiresAt };
}

function get(token) {
  return getInvite.get(String(token)) || null;
}

function reject(token, userId, now = Date.now()) {
  const row = get(token);
  if (!row) return { ok: false, code: 'missing' };
  if (String(row.invitee_id) !== String(userId)) return { ok: false, code: 'not_invited_user' };
  if (row.status !== 'pending') return { ok: false, code: 'not_pending' };
  if (Number(row.expires_at) <= now) {
    expireStmt.run(String(token));
    return { ok: false, code: 'expired' };
  }
  const result = rejectStmt.run(String(token), String(userId));
  return result.changes ? { ok: true, rejected: true, invite: row } : { ok: false, code: 'not_pending' };
}

const acceptTx = db.transaction((token, userId, now) => {
  const row = getInvite.get(String(token));
  if (!row) return { ok: false, code: 'missing' };
  if (String(row.invitee_id) !== String(userId)) return { ok: false, code: 'not_invited_user' };
  if (row.status !== 'pending') return { ok: false, code: 'not_pending' };
  if (Number(row.expires_at) <= now) {
    expireStmt.run(String(token));
    return { ok: false, code: 'expired' };
  }

  // Claim the invitation inside the same transaction as the membership change.
  const claimed = db.prepare(`
    UPDATE clan_invites SET status = 'accepted'
    WHERE token = ? AND invitee_id = ? AND status = 'pending' AND expires_at > ?
  `).run(String(token), String(userId), Number(now));
  if (!claimed.changes) return { ok: false, code: 'not_pending' };

  const joined = clanService.joinClan(row.guild_id, row.invitee_id, row.clan_id, now, true);
  return { ok: true, rejected: false, invite: row, ...joined };
});

function accept(token, userId, now = Date.now()) {
  return acceptTx(String(token), String(userId), Number(now));
}

function prune(now = Date.now()) {
  return pruneStmt.run(Number(now)).changes;
}

module.exports = { create, get, accept, reject, prune };
