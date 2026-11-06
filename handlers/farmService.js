'use strict';
// ============================================================
// FARM SERVICE
// All game rules and database work. Everything that changes
// money, items or progress runs inside ONE database transaction
// on economy.sqlite (the same database as the wallet), so a
// purchase/sale can never half-complete or be duplicated.
// ============================================================
const { randomInt } = require('crypto');
const economy = require('./economy');
const CFG = require('./farmConfig');
const { emoji, seedEmoji } = require('./farmEmojis');
const db = economy.db;
class FarmError extends Error {
constructor(message) {
super(message);
this.name = 'FarmError';
}
}
// ------------------------------------------------------------
// Schema (all CREATE IF NOT EXISTS - existing data is untouched)
// ------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS farm_players (
guild_id TEXT NOT NULL,
user_id TEXT NOT NULL,
level INTEGER NOT NULL DEFAULT 1,
xp INTEGER NOT NULL DEFAULT 0,
plots INTEGER NOT NULL DEFAULT 3,
expansion_tier INTEGER NOT NULL DEFAULT 0,
can_tier INTEGER NOT NULL DEFAULT 1,
hoe_tier INTEGER NOT NULL DEFAULT 0,
crops_harvested INTEGER NOT NULL DEFAULT 0,
plots_harvested INTEGER NOT NULL DEFAULT 0,
total_earned INTEGER NOT NULL DEFAULT 0,
total_spent INTEGER NOT NULL DEFAULT 0,
contracts_done INTEGER NOT NULL DEFAULT 0,
quests_done INTEGER NOT NULL DEFAULT 0,
created_at INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS farm_plots (
guild_id TEXT NOT NULL,
user_id TEXT NOT NULL,
plot_no INTEGER NOT NULL,
crop_id TEXT NOT NULL,
planted_at INTEGER NOT NULL,
ready_at INTEGER NOT NULL,
fert_count INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY (guild_id, user_id, plot_no)
);
CREATE TABLE IF NOT EXISTS farm_inventory (
guild_id TEXT NOT NULL,
user_id TEXT NOT NULL,
item_id TEXT NOT NULL,
qty INTEGER NOT NULL CHECK (qty >= 0),
PRIMARY KEY (guild_id, user_id, item_id)
);
CREATE TABLE IF NOT EXISTS farm_decor (
guild_id TEXT NOT NULL,
user_id TEXT NOT NULL,
decor_id TEXT NOT NULL,
bought_at INTEGER NOT NULL,
PRIMARY KEY (guild_id, user_id, decor_id)
);
CREATE TABLE IF NOT EXISTS farm_quests (
guild_id TEXT NOT NULL,
user_id TEXT NOT NULL,
day_key TEXT NOT NULL,
slot INTEGER NOT NULL,
kind TEXT NOT NULL,
crop_id TEXT,
target INTEGER NOT NULL,
progress INTEGER NOT NULL DEFAULT 0,
reward_coins INTEGER NOT NULL DEFAULT 0,
reward_xp INTEGER NOT NULL DEFAULT 0,
done INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY (guild_id, user_id, day_key, slot)
);
CREATE TABLE IF NOT EXISTS farm_quest_bonus (
guild_id TEXT NOT NULL,
user_id TEXT NOT NULL,
day_key TEXT NOT NULL,
claimed_at INTEGER NOT NULL,
PRIMARY KEY (guild_id, user_id, day_key)
);
CREATE TABLE IF NOT EXISTS farm_contracts (
guild_id TEXT NOT NULL,
user_id TEXT NOT NULL,
period_key TEXT NOT NULL,
slot INTEGER NOT NULL,
template_id TEXT NOT NULL,
crop_id TEXT NOT NULL,
target INTEGER NOT NULL,
delivered INTEGER NOT NULL DEFAULT 0,
reward_coins INTEGER NOT NULL DEFAULT 0,
reward_xp INTEGER NOT NULL DEFAULT 0,
done INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY (guild_id, user_id, period_key, slot)
);
CREATE TABLE IF NOT EXISTS farm_achievements (
guild_id TEXT NOT NULL,
user_id TEXT NOT NULL,
achievement_id TEXT NOT NULL,
claimed_at INTEGER NOT NULL,
PRIMARY KEY (guild_id, user_id, achievement_id)
);
CREATE TABLE IF NOT EXISTS farm_market (
guild_id TEXT NOT NULL,
crop_id TEXT NOT NULL,
multiplier REAL NOT NULL DEFAULT 1,
slot_no INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY (guild_id, crop_id)
);
CREATE TABLE IF NOT EXISTS farm_events (
id INTEGER PRIMARY KEY AUTOINCREMENT,
guild_id TEXT NOT NULL,
slot_no INTEGER NOT NULL,
kind TEXT NOT NULL,
detail TEXT,
starts_at INTEGER NOT NULL,
ends_at INTEGER NOT NULL,
UNIQUE (guild_id, slot_no)
);
CREATE TABLE IF NOT EXISTS farm_log (
id INTEGER PRIMARY KEY AUTOINCREMENT,
guild_id TEXT NOT NULL,
user_id TEXT NOT NULL,
act TEXT NOT NULL,
detail TEXT,
amount INTEGER NOT NULL DEFAULT 0,
ts INTEGER NOT NULL
);
`);
// ------------------------------------------------------------
// Lookups and small helpers
// ------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6, same as the economy
const cropMap = new Map(CFG.CROPS.map(c => [c.id, c]));
const fertMap = new Map(CFG.FERTILIZERS.map(f => [f.id, f]));
const decorMap = new Map(CFG.DECORATIONS.map(d => [d.id, d]));
const canByTier = new Map(CFG.WATERING_CANS.map(c => [c.tier, c]));
const hoeByTier = new Map(CFG.HOES.map(h => [h.tier, h]));
const eventMap = new Map(CFG.EVENTS.map(e => [e.id, e]));
const money = amount => economy.formatCurrency(amount);
function dayKey(ts) {
const d = new Date(ts + TZ_OFFSET_MS);
return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,
'0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function periodKey(ts) {
return String(Math.floor((ts + TZ_OFFSET_MS) / CFG.CONTRACT_PERIOD_MS));
}
const randInt = (min, max) => randomInt(min, max + 1);
const pick = arr => arr[randomInt(0, arr.length)];
const chance = p => randomInt(0, 1_000_000) < Math.floor(p * 1_000_000);
function shuffle(arr) {
const a = arr.slice();
for (let i = a.length - 1; i > 0; i--) {
const j = randomInt(0, i + 1);
[a[i], a[j]] = [a[j], a[i]];
}
return a;
}
function titleFor(level) {
let title = CFG.TITLES[0].name;
for (const t of CFG.TITLES) if (level >= t.level) title = t.name;
return title;
}
// ------------------------------------------------------------
// Prepared statements
// ------------------------------------------------------------
const S = {
insPlayer: db.prepare(`INSERT OR IGNORE INTO farm_players (guild_id, user_id, plots,
created_at) VALUES (?, ?, ?, ?)`),
getPlayer: db.prepare(`SELECT * FROM farm_players WHERE guild_id = ? AND user_id =
?`),
setXp: db.prepare(`UPDATE farm_players SET level = ?, xp = ? WHERE guild_id = ? AND
user_id = ?`),
addEarned: db.prepare(`UPDATE farm_players SET total_earned = total_earned + ? WHERE
guild_id = ? AND user_id = ?`),
addSpent: db.prepare(`UPDATE farm_players SET total_spent = total_spent + ? WHERE
guild_id = ? AND user_id = ?`),
addHarvest: db.prepare(`UPDATE farm_players SET crops_harvested = crops_harvested + ?,
plots_harvested = plots_harvested + ? WHERE guild_id = ? AND user_id = ?`),
addQuestDone: db.prepare(`UPDATE farm_players SET quests_done = quests_done + 1
WHERE guild_id = ? AND user_id = ?`),
addContractDone: db.prepare(`UPDATE farm_players SET contracts_done = contracts_done
+ 1 WHERE guild_id = ? AND user_id = ?`),
setExpansion: db.prepare(`UPDATE farm_players SET plots = ?, expansion_tier = ? WHERE
guild_id = ? AND user_id = ?`),
setCan: db.prepare(`UPDATE farm_players SET can_tier = ? WHERE guild_id = ? AND
user_id = ?`),
setHoe: db.prepare(`UPDATE farm_players SET hoe_tier = ? WHERE guild_id = ? AND
user_id = ?`),
plots: db.prepare(`SELECT * FROM farm_plots WHERE guild_id = ? AND user_id = ? ORDER
BY plot_no`),
plotNos: db.prepare(`SELECT plot_no FROM farm_plots WHERE guild_id = ? AND user_id =
?`),
getPlot: db.prepare(`SELECT * FROM farm_plots WHERE guild_id = ? AND user_id = ? AND
plot_no = ?`),
insPlot: db.prepare(`INSERT INTO farm_plots (guild_id, user_id, plot_no, crop_id, planted_at,
ready_at) VALUES (?, ?, ?, ?, ?, ?)`),
delPlot: db.prepare(`DELETE FROM farm_plots WHERE guild_id = ? AND user_id = ? AND
plot_no = ?`),
fertPlot: db.prepare(`UPDATE farm_plots SET ready_at = ?, fert_count = fert_count + 1
WHERE guild_id = ? AND user_id = ? AND plot_no = ?`),
addItem: db.prepare(`INSERT INTO farm_inventory (guild_id, user_id, item_id, qty) VALUES
(?, ?, ?, ?) ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET qty = qty +
excluded.qty`),
takeItem: db.prepare(`UPDATE farm_inventory SET qty = qty - ? WHERE guild_id = ? AND
user_id = ? AND item_id = ? AND qty >= ?`),
getItem: db.prepare(`SELECT qty FROM farm_inventory WHERE guild_id = ? AND user_id =
? AND item_id = ?`),
allItems: db.prepare(`SELECT item_id, qty FROM farm_inventory WHERE guild_id = ? AND
user_id = ? AND qty > 0 ORDER BY item_id`),
cleanItems: db.prepare(`DELETE FROM farm_inventory WHERE guild_id = ? AND user_id = ?
AND qty <= 0`),
getDecor: db.prepare(`SELECT decor_id FROM farm_decor WHERE guild_id = ? AND
user_id = ? ORDER BY bought_at`),
insDecor: db.prepare(`INSERT OR IGNORE INTO farm_decor (guild_id, user_id, decor_id,
bought_at) VALUES (?, ?, ?, ?)`),
getQuests: db.prepare(`SELECT * FROM farm_quests WHERE guild_id = ? AND user_id = ?
AND day_key = ? ORDER BY slot`),
insQuest: db.prepare(`INSERT OR IGNORE INTO farm_quests (guild_id, user_id, day_key,
slot, kind, crop_id, target, reward_coins, reward_xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
setQuestProgress: db.prepare(`UPDATE farm_quests SET progress = ? WHERE guild_id = ?
AND user_id = ? AND day_key = ? AND slot = ? AND done = 0`),
finishQuest: db.prepare(`UPDATE farm_quests SET progress = target, done = 1 WHERE
guild_id = ? AND user_id = ? AND day_key = ? AND slot = ? AND done = 0`),
insQuestBonus: db.prepare(`INSERT OR IGNORE INTO farm_quest_bonus (guild_id, user_id,
day_key, claimed_at) VALUES (?, ?, ?, ?)`),
getQuestBonus: db.prepare(`SELECT 1 FROM farm_quest_bonus WHERE guild_id = ? AND
user_id = ? AND day_key = ?`),
getContracts: db.prepare(`SELECT * FROM farm_contracts WHERE guild_id = ? AND user_id
= ? AND period_key = ? ORDER BY slot`),
insContract: db.prepare(`INSERT OR IGNORE INTO farm_contracts (guild_id, user_id,
period_key, slot, template_id, crop_id, target, reward_coins, reward_xp) VALUES (?, ?, ?, ?, ?,
?, ?, ?, ?)`),
getContract: db.prepare(`SELECT * FROM farm_contracts WHERE guild_id = ? AND user_id
= ? AND period_key = ? AND slot = ?`),
setContractDelivered: db.prepare(`UPDATE farm_contracts SET delivered = ? WHERE
guild_id = ? AND user_id = ? AND period_key = ? AND slot = ? AND done = 0`),
finishContract: db.prepare(`UPDATE farm_contracts SET delivered = target, done = 1 WHERE
guild_id = ? AND user_id = ? AND period_key = ? AND slot = ? AND done = 0`),
getAch: db.prepare(`SELECT achievement_id FROM farm_achievements WHERE guild_id = ?
AND user_id = ?`),
insAch: db.prepare(`INSERT OR IGNORE INTO farm_achievements (guild_id, user_id,
achievement_id, claimed_at) VALUES (?, ?, ?, ?)`),
marketSlot: db.prepare(`SELECT slot_no FROM farm_market WHERE guild_id = ? LIMIT 1`),
marketAll: db.prepare(`SELECT crop_id, multiplier FROM farm_market WHERE guild_id = ?`),
upsertMarket: db.prepare(`INSERT INTO farm_market (guild_id, crop_id, multiplier, slot_no)
VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, crop_id) DO UPDATE SET multiplier =
excluded.multiplier, slot_no = excluded.slot_no`),
insEvent: db.prepare(`INSERT OR IGNORE INTO farm_events (guild_id, slot_no, kind, detail,
starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)`),
activeEvent: db.prepare(`SELECT * FROM farm_events WHERE guild_id = ? AND starts_at
<= ? AND ends_at > ? ORDER BY starts_at DESC LIMIT 1`),
insLog: db.prepare(`INSERT INTO farm_log (guild_id, user_id, act, detail, amount, ts) VALUES
(?, ?, ?, ?, ?, ?)`),
};
function log(gid, uid, act, detail, amount, ts) {
S.insLog.run(gid, uid, act, detail ? String(detail).slice(0, 300) : null, Math.floor(Number(amount)
|| 0), ts);
}
// ------------------------------------------------------------
// Inventory + wallet helpers (call these inside transactions)
// ------------------------------------------------------------
function addItem(gid, uid, key, qty) {
qty = Math.floor(Number(qty));
if (!Number.isSafeInteger(qty) || qty <= 0) return;
S.addItem.run(gid, uid, key, qty);
}
function takeItem(gid, uid, key, qty, label) {
qty = Math.floor(Number(qty));
if (!Number.isSafeInteger(qty) || qty <= 0) throw new FarmError('Invalid amount.');
const res = S.takeItem.run(qty, gid, uid, key, qty);
if (res.changes === 0) {
throw new FarmError(`You do not have enough ${label || 'items'}.`);
}
S.cleanItems.run(gid, uid);
}
function getQty(gid, uid, key) {
return S.getItem.get(gid, uid, key)?.qty || 0;
}
function charge(gid, uid, amount, type, reason, now) {
amount = Math.floor(Number(amount));
if (!Number.isSafeInteger(amount) || amount <= 0) throw new FarmError('Invalid price.');
const res = economy.removeCrowns(gid, uid, amount, { type, reason, actorId: uid, timestamp:
now });
if (!res) {
throw new FarmError(`You need ${money(amount)} for that, but you only have
${money(economy.getBalance(gid, uid))}.`);
}
S.addSpent.run(amount, gid, uid);
}
function pay(gid, uid, amount, type, reason, now) {
amount = Math.floor(Number(amount));
if (!Number.isSafeInteger(amount) || amount <= 0) return;
economy.addCrowns(gid, uid, amount, { type, reason, actorId: uid, timestamp: now });
S.addEarned.run(amount, gid, uid);
}
// ------------------------------------------------------------
// Players
// ------------------------------------------------------------
const openFarmTx = db.transaction((gid, uid, now) => {
const res = S.insPlayer.run(gid, uid, CFG.EXPANSIONS[0].plots, now);
let created = false;
let grant = 0;
if (res.changes === 1) {
created = true;
for (const [cropId, qty] of Object.entries(CFG.START_SEEDS)) {
addItem(gid, uid, `seed:${cropId}`, qty);
}
if (CFG.STARTING_GRANT > 0) {
economy.addCrowns(gid, uid, CFG.STARTING_GRANT, {
type: 'farm_start_grant',
reason: 'Farm starter grant',
actorId: uid,
timestamp: now,
});
grant = CFG.STARTING_GRANT;
}
log(gid, uid, 'start', 'Farm created', grant, now);
}
return { created, grant };
});
function openFarm(gid, uid, now = Date.now()) {
gid = String(gid);
uid = String(uid);
const { created, grant } = openFarmTx(gid, uid, now);
return { created, grant, player: S.getPlayer.get(gid, uid) };
}
function hasFarm(gid, uid) {
return !!S.getPlayer.get(String(gid), String(uid));
}
// Adds XP, handles level ups. notes.levelUps collects results.
function addXp(gid, uid, amount, notes) {
amount = Math.max(0, Math.floor(Number(amount) || 0));
if (amount <= 0) return;
const p = S.getPlayer.get(gid, uid);
let level = p.level;
let xp = p.xp + amount;
const gained = [];
while (level < CFG.MAX_LEVEL && xp >= CFG.xpToNext(level)) {
xp -= CFG.xpToNext(level);
level += 1;
gained.push(level);
}
S.setXp.run(level, xp, gid, uid);
if (notes) {
notes.xp = (notes.xp || 0) + amount;
for (const lvl of gained) {
notes.levelUps = notes.levelUps || [];
notes.levelUps.push({ level: lvl, unlocks: unlocksAt(lvl) });
}
}
}
function unlocksAt(level) {
const names = [];
for (const c of CFG.CROPS) if (c.level === level && level > 1) names.push(c.name);
for (const t of CFG.WATERING_CANS) if (t.level === level && level > 1) names.push(t.name);
for (const t of CFG.HOES) if (t.level === level) names.push(t.name);
for (const f of CFG.FERTILIZERS) if (f.level === level && level > 1) names.push(f.name);
for (const d of CFG.DECORATIONS) if (d.level === level && level > 1) names.push(d.name);
return names;
}
// ------------------------------------------------------------
// Market and events
// ------------------------------------------------------------
function tickMarket(gid, now) {
const slot = Math.floor(now / CFG.MARKET_INTERVAL_MS);
const row = S.marketSlot.get(gid);
if (row && row.slot_no === slot) return;
db.transaction(() => {
const span = CFG.MARKET_MAX - CFG.MARKET_MIN;
for (const crop of CFG.CROPS) {
// Average of two rolls keeps most prices near 100%.
const r = (randomInt(0, 10001) + randomInt(0, 10001)) / 20000;
const mult = Math.round((CFG.MARKET_MIN + span * r) * 100) / 100;
S.upsertMarket.run(gid, crop.id, mult, slot);
}
if (chance(CFG.EVENT_CHANCE)) {
const ev = pick(CFG.EVENTS);
let detail = {};
if (ev.id === 'market_boom') {
detail = { crops: shuffle(CFG.CROPS).slice(0, ev.boostCount).map(c => c.id) };
}
// UNIQUE(guild_id, slot_no) means one recorded event per update.
S.insEvent.run(gid, slot, ev.id, JSON.stringify(detail), now, now + ev.durationMs);
}
})();
}
function getMarket(gid, now = Date.now()) {
gid = String(gid);
tickMarket(gid, now);
const mult = {};
for (const r of S.marketAll.all(gid)) mult[r.crop_id] = r.multiplier;
let event = null;
const row = S.activeEvent.get(gid, now, now);
if (row) {
const def = eventMap.get(row.kind);
if (def) {
let detail = {};
try { detail = JSON.parse(row.detail || '{}'); } catch { detail = {}; }
event = { ...def, detail, startsAt: row.starts_at, endsAt: row.ends_at };
}
}
const slot = Math.floor(now / CFG.MARKET_INTERVAL_MS);
return { mult, event, nextUpdateAt: (slot + 1) * CFG.MARKET_INTERVAL_MS };
}
function unitPrice(crop, market) {
let m = market.mult[crop.id] || 1;
if (market.event?.id === 'market_boom' && market.event.detail?.crops?.includes(crop.id)) {
m *= market.event.boostMult;
}
return Math.max(1, Math.round(crop.price * m));
}
// ----------------------------------------------
