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

  // Format: [name, slug, description, tier, min, max, cooldown_ms, faction_id, xpMin, xpMax]
  const jobs = [
    // ---------- NORMAL JOBS (15k - 20k) ----------
    ['Store Clerk','store-clerk','Day-to-day retail: fold shirts, restock shelves.','normal',15000,20000,30*60*1000, null, 8, 16],
    ['Delivery Rider','delivery-rider','Deliver packages around town.','normal',15000,20000,30*60*1000, null, 9, 18],
    ['Barista','barista','Make coffee, tolerate customers.','normal',15000,20000,30*60*1000, null, 8, 16],
    ['Cleaner','cleaner','Basic cleaning shifts; repetitive but steady.','normal',14000,18000,30*60*1000, null, 7, 14],
    ['Security Guard','security-guard','Night shift guarding: low risk.','normal',15000,20000,35*60*1000, null, 9, 17],
    ['Shop Assistant','shop-assistant','Help customers and stock shelves.','normal',15000,20000,30*60*1000, null, 8, 16],
    ['Library Aide','library-aide','Quiet work — reshelve and catalog books.','normal',14000,18000,25*60*1000, null, 7, 13],
    ['Warehouse Loader','warehouse-loader','Shift-based heavy lifting.','normal',15000,20000,30*60*1000, null, 10, 18],
    ['Taxi Helper','taxi-helper','Assist drivers, maintain vehicles.','normal',15000,20000,30*60*1000, null, 8, 16],
    ['Kitchen Hand','kitchen-hand','Prep and clean — chaotic but useful.','normal',15000,20000,30*60*1000, null, 8, 16],
    ['Gardener','gardener','Tend plants and green spaces.','normal',14000,18000,30*60*1000, null, 7, 15],
    ['Call Center Rep','call-center','Handle calls, read scripts.','normal',15000,20000,30*60*1000, null, 9, 17],
    ['Courier','courier','Quick deliveries across town.','normal',15000,20000,30*60*1000, null, 9, 18],
    ['Cleaner II','cleaner-ii','Trusted cleaner with slightly higher pay.','normal',16000,21000,30*60*1000, null, 9, 18],
    ['Event Helper','event-helper','Assist events — irregular but decent.','normal',15000,20000,30*60*1000, null, 8, 16],

    // ---------- ELITE JOBS (30k - 50k) ----------
    ['Software Contractor','software-contractor','Short-term dev gigs.','elite',30000,50000,30*60*1000, null, 20, 40],
    ['Medical Assistant','medical-assistant','High responsibility shift work.','elite',30000,50000,30*60*1000, null, 22, 46],
    ['Private Tutor','private-tutor','High-skill tutoring gigs.','elite',30000,45000,40*60*1000, null, 18, 36],
    ['Freelance Designer','freelance-designer','Design work, tight deadlines, good pay.','elite',30000,48000,35*60*1000, null, 20, 38],
    ['Consultant','consultant','Short consultancy contracts with high reward.','elite',32000,50000,45*60*1000, null, 24, 44],
    ['Security Contractor','security-contractor','High-risk private security.','elite',32000,48000,40*60*1000, null, 22, 42],
    ['Event Manager','event-manager','Manage event ops and teams.','elite',30000,45000,40*60*1000, null, 20, 38],
    ['Senior Driver','senior-driver','Private transport for VIPs.','elite',30000,48000,35*60*1000, null, 19, 38],

    // ---------- FACTION JOBS (require faction) ----------
    // Using placeholder faction slugs — these will be compared to user.faction_id
    ['Faction Guard','faction-guard','Exclusive faction duty (public only when faction assigned).','faction',35000,50000,20*60*1000, 'FACTION_ALPHA', 18, 36],
    ['Faction Scout','faction-scout','Recon & small payouts for your faction.','faction',20000,35000,20*60*1000, 'FACTION_BETA', 12, 24],
    ['Faction Engineer','faction-engineer','Tech support for faction operations.','faction',30000,45000,25*60*1000, 'FACTION_GAMMA', 18, 36],
    ['Faction Medic','faction-medic','Faction-exclusive medical support.','faction',30000,45000,25*60*1000, 'FACTION_DELTA', 20, 40],
    ['Faction Broker','faction-broker','Manage faction trades.','faction',28000,42000,30*60*1000, 'FACTION_ALPHA', 16, 34],
    ['Faction Raider','faction-raider','High-risk raid ops (requires coordination).','faction',40000,60000,40*60*1000, 'FACTION_BETA', 25, 50]
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
  // If user already has job, reject
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