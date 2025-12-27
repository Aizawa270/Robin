// handlers/jobs.js
const econ = require('./economy'); // uses the economy DB
const db = econ.db;

// Create jobs tables in the same economy DB for simplicity
db.prepare(`
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  tier TEXT NOT NULL, -- normal | elite | faction
  min_pay INTEGER NOT NULL,
  max_pay INTEGER NOT NULL,
  cooldown_ms INTEGER NOT NULL,
  faction_id TEXT DEFAULT NULL,
  xp_per_work_min INTEGER DEFAULT 5,
  xp_per_work_max INTEGER DEFAULT 15
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS user_jobs (
  user_id TEXT PRIMARY KEY,
  job_id INTEGER,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  last_work_ts INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  FOREIGN KEY(job_id) REFERENCES jobs(id)
)
`).run();

// Seed a sane set of jobs if none exist
function seedJobs() {
  const count = db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
  if (count > 0) return;

  const jobs = [
    // normal jobs (15k-20k)
    ['Store Clerk','store-clerk','Day-to-day retail: fold shirts, restock shelves.','normal',15000,20000,30*60*1000, null, 8, 16],
    ['Delivery Rider','delivery-rider','Deliver packages around town.','normal',15000,20000,30*60*1000, null, 9, 18],
    ['Barista','barista','Make coffee, tolerate customers.','normal',15000,20000,30*60*1000, null, 8, 16],

    // elite jobs (30k-50k)
    ['Software Contractor','software-contractor','Short-term dev gigs.','elite',30000,50000,30*60*1000, null, 20, 40],
    ['Medical Assistant','medical-assistant','High responsibility shift work.','elite',30000,50000,30*60*1000, null, 22, 46],

    // faction sample (will be associated later)
    ['Faction Guard','faction-guard','Exclusive faction duty (public only when faction assigned).','faction',35000,50000,20*60*1000, 'FACTION_ALPH', 18, 36],
  ];

  const insert = db.prepare(`INSERT INTO jobs (name, slug, description, tier, min_pay, max_pay, cooldown_ms, faction_id, xp_per_work_min, xp_per_work_max)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tran = db.transaction((rows) => {
    for (const r of rows) insert.run(...r);
  });
  tran(jobs);
}
seedJobs();

// helpers
function listJobs(includeFaction = false) {
  if (includeFaction) {
    return db.prepare('SELECT * FROM jobs ORDER BY tier, name').all();
  }
  return db.prepare('SELECT * FROM jobs WHERE faction_id IS NULL ORDER BY tier, name').all();
}

function getJobById(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}
function getJobBySlug(slug) {
  return db.prepare('SELECT * FROM jobs WHERE slug = ?').get(slug);
}

function getUserJob(userId) {
  econ.ensureUser(userId);
  const uj = db.prepare('SELECT * FROM user_jobs WHERE user_id = ?').get(userId);
  return uj || null;
}

function applyJob(userId, jobId) {
  const job = getJobById(jobId);
  if (!job) throw new Error('job not found');
  // If user already has job, replace it (or reject). We'll reject to be safe.
  const existing = getUserJob(userId);
  if (existing && existing.job_id) throw new Error('already has a job');

  db.prepare(`INSERT OR REPLACE INTO user_jobs (user_id, job_id, xp, level, last_work_ts, total_earned)
    VALUES (?, ?, 0, 1, 0, 0)`).run(userId, jobId);

  return true;
}

function leaveJob(userId) {
  db.prepare('DELETE FROM user_jobs WHERE user_id = ?').run(userId);
  return true;
}

function canWork(userId, jobRow) {
  const uj = getUserJob(userId);
  if (!uj || !uj.job_id) return { ok: false, reason: 'no_job' };
  const now = Date.now();
  if ((now - (uj.last_work_ts || 0)) < jobRow.cooldown_ms) {
    return { ok: false, reason: 'cooldown', remaining: jobRow.cooldown_ms - (now - uj.last_work_ts) };
  }
  return { ok: true };
}

function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function doWork(userId) {
  const uj = getUserJob(userId);
  if (!uj) throw new Error('no job');

  const job = getJobById(uj.job_id);
  if (!job) throw new Error('job missing');

  // ensure cooldown
  const now = Date.now();
  if ((now - (uj.last_work_ts || 0)) < job.cooldown_ms) {
    throw new Error('cooldown');
  }

  // Payment
  const pay = roll(job.min_pay, job.max_pay);

  // XP gain
  const xpGain = roll(job.xp_per_work_min || 5, job.xp_per_work_max || 15);
  let newXp = (uj.xp || 0) + xpGain;
  let level = uj.level || 1;
  // level up threshold simple: level * 100 XP
  const xpThreshold = level * 100;
  if (newXp >= xpThreshold) {
    newXp = newXp - xpThreshold;
    level = level + 1;
  }

  // Update DB: set last_work_ts, xp, level, add total earned
  db.prepare(`INSERT OR REPLACE INTO user_jobs (user_id, job_id, xp, level, last_work_ts, total_earned)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT total_earned FROM user_jobs WHERE user_id = ?), 0) + ?)
  `).run(userId, job.id, newXp, level, now, userId, pay);

  // Economy wallet update + lifetime + monthly tracking
  econ.addWallet(userId, pay);
  econ.addLifetimeEarned(userId, pay);
  econ.addNonGamblingEarnedMonth(userId, pay);

  return { pay, xpGain, newXp, level, job };
}

function getJobLeaderboard(limit = 10) {
  // rank by total_earned in user_jobs
  return db.prepare(`
    SELECT user_jobs.user_id, user_jobs.total_earned, jobs.name as job_name
    FROM user_jobs
    LEFT JOIN jobs ON jobs.id = user_jobs.job_id
    ORDER BY user_jobs.total_earned DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  listJobs,
  getJobById,
  getJobBySlug,
  getUserJob,
  applyJob,
  leaveJob,
  canWork,
  doWork,
  getJobLeaderboard
};