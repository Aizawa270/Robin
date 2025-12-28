// handlers/jobs.js
const econ = require('./economy'); // uses the economy DB
const items = require('./items'); // for item effects
const db = econ.db;

// ================= TABLES =================
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

// ================= JOB SEED =================
function seedJobs() {
  const count = db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;
  if (count > 0) return;

  const jobs = [
    // NORMAL JOBS
    ['Store Clerk','store-clerk','Day-to-day retail: fold shirts, restock shelves. Items may slightly boost payout.','normal',15000,20000,30*60*1000,null,8,16],
    ['Delivery Rider','delivery-rider','Deliver packages around town. Active items may double your payout or reduce cooldowns.','normal',15000,20000,30*60*1000,null,9,18],
    ['Barista','barista','Make coffee, tolerate customers. Can trigger risky job bonuses with certain items.','normal',15000,20000,30*60*1000,null,8,16],
    ['Library Assistant','library-assistant','Sort books, assist students. Passive job bonuses may apply.','normal',15000,18000,25*60*1000,null,7,15],
    ['Street Vendor','street-vendor','Sell goods on the streets. Some items can increase earnings.','normal',16000,21000,30*60*1000,null,8,17],

    // ELITE JOBS
    ['Software Contractor','software-contractor','Short-term dev gigs. High payout; can benefit from double_work or job_bonus items.','elite',30000,50000,30*60*1000,null,20,40],
    ['Medical Assistant','medical-assistant','High responsibility shift work. Items may affect cooldown or XP gain.','elite',30000,50000,30*60*1000,null,22,46],
    ['Event Coordinator','event-coordinator','Plan events and manage staff. Can trigger risky_job items.','elite',32000,52000,35*60*1000,null,20,45],
    ['Research Assistant','research-assistant','Assist in labs; passive effects increase efficiency.','elite',30000,50000,30*60*1000,null,18,40],

    // FACTION JOBS
    ['Faction Guard','faction-guard','Exclusive faction duty (FACTION_ALPHA). Can interact with faction-related items.','faction',35000,50000,20*60*1000,'FACTION_ALPHA',18,36],
    ['Faction Spy','faction-spy','Stealth missions for FACTION_BETA. Certain active items enhance success.','faction',40000,55000,25*60*1000,'FACTION_BETA',20,40],
    ['Faction Trader','faction-trader','Manage faction resources (FACTION_GAMMA). Can trigger double_work or bonus items.','faction',36000,52000,20*60*1000,'FACTION_GAMMA',18,38],
    ['Faction Enforcer','faction-enforcer','Keep order for FACTION_DELTA. Risky_job items may boost payout.','faction',38000,54000,22*60*1000,'FACTION_DELTA',20,42],
  ];

  const insert = db.prepare(`INSERT INTO jobs (name, slug, description, tier, min_pay, max_pay, cooldown_ms, faction_id, xp_per_work_min, xp_per_work_max)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tran = db.transaction((rows) => {
    for (const r of rows) insert.run(...r);
  });
  tran(jobs);
}
seedJobs();

// ================= HELPERS =================
function listJobs(includeFaction = false) {
  if (includeFaction) return db.prepare('SELECT * FROM jobs ORDER BY tier, name').all();
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
  return db.prepare('SELECT * FROM user_jobs WHERE user_id = ?').get(userId) || null;
}

function applyJob(userId, jobId) {
  const job = getJobById(jobId);
  if (!job) throw new Error('job not found');
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

// ================= WORK FUNCTION (ITEMS INTEGRATED) =================
function doWork(userId) {
  const uj = getUserJob(userId);
  if (!uj) throw new Error('no job');
  const job = getJobById(uj.job_id);
  if (!job) throw new Error('job missing');

  const now = Date.now();
  if ((now - (uj.last_work_ts || 0)) < job.cooldown_ms) throw new Error('cooldown');

  // ================= APPLY ITEM EFFECTS =================
  const userItems = items.getInventory(userId);
  let multiplier = 1;
  let flatBonus = 0;
  let skipCooldown = false;
  let risky = false;

  for (const it of userItems) {
    switch (it.effect) {
      case 'double_work':
        multiplier *= 2;
        break;
      case 'job_bonus_2':
      case 'job_bonus_5':
      case 'job_bonus_8':
        flatBonus += parseInt(it.effect.split('_').pop());
        break;
      case 'skip_job_cd':
        skipCooldown = true;
        break;
      case 'risky_job':
        risky = true;
        break;
      default:
        break;
    }
  }

  let pay = roll(job.min_pay, job.max_pay);
  pay = Math.floor(pay * multiplier + (pay * flatBonus / 100));
  if (risky) pay = Math.floor(pay * (1 + Math.random() * 0.5)); // risky bonus

  // XP
  const xpGain = roll(job.xp_per_work_min || 5, job.xp_per_work_max || 15);
  let newXp = (uj.xp || 0) + xpGain;
  let level = uj.level || 1;
  const xpThreshold = level * 100;
  if (newXp >= xpThreshold) {
    newXp -= xpThreshold;
    level += 1;
  }

  // Update DB
  const lastTs = skipCooldown ? uj.last_work_ts : now;
  db.prepare(`INSERT OR REPLACE INTO user_jobs (user_id, job_id, xp, level, last_work_ts, total_earned)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT total_earned FROM user_jobs WHERE user_id = ?), 0) + ?)
  `).run(userId, job.id, newXp, level, lastTs, userId, pay);

  // Update wallet/earnings
  econ.addWallet(userId, pay);
  econ.addLifetimeEarned(userId, pay);
  econ.addNonGamblingEarnedMonth(userId, pay);

  return { pay, xpGain, newXp, level, job };
}

function getJobLeaderboard(limit = 10) {
  return db.prepare(`
    SELECT user_jobs.user_id, user_jobs.total_earned, jobs.name as job_name
    FROM user_jobs
    LEFT JOIN jobs ON jobs.id = user_jobs.job_id
    ORDER BY user_jobs.total_earned DESC
    LIMIT ?
  `).all(limit);
}

// ================= EXPORTS =================
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