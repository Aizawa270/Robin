// commands/misc/1v1.js

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ─── ADMIN ───────────────────────────────────────────────────────────────────
const ADMIN_IDS = ['852839588689870879', '908521674700390430'];
function isAdmin(userId) { return ADMIN_IDS.includes(userId); }

// ─── DATABASE ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, '1v1.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    user_id       TEXT PRIMARY KEY,
    wins          INTEGER DEFAULT 0,
    losses        INTEGER DEFAULT 0,
    points_gifted INTEGER DEFAULT 0,
    rp            INTEGER DEFAULT 0,
    streak        INTEGER DEFAULT 0,
    last_battle   INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS inventory (
    user_id TEXT,
    animal  TEXT,
    amount  INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, animal)
  );
  CREATE TABLE IF NOT EXISTS pack_cooldowns (
    user_id      TEXT    PRIMARY KEY,
    window_start INTEGER DEFAULT 0,
    packs_used   INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS point_cooldowns (
    user_id    TEXT PRIMARY KEY,
    last_point INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS daily_cooldowns (
    user_id    TEXT PRIMARY KEY,
    last_daily INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS rp_pack_cooldowns (
    user_id    TEXT PRIMARY KEY,
    last_rp_pack INTEGER DEFAULT 0
  );
`);

// Safe migrations for existing databases
for (const col of ['rp INTEGER DEFAULT 0', 'streak INTEGER DEFAULT 0', 'last_battle INTEGER DEFAULT 0']) {
  try { db.exec(`ALTER TABLE profiles ADD COLUMN ${col}`); } catch {}
}

console.log('[1v1] Database initialized');

// ─── RANK SYSTEM ─────────────────────────────────────────────────────────────
const RANKS = [
  { name: 'Bronze',   min: 0,    max: 199,        emoji: '🥉', color: 0xcd7f32 },
  { name: 'Silver',   min: 200,  max: 499,        emoji: '🥈', color: 0xbdc3c7 },
  { name: 'Gold',     min: 500,  max: 999,        emoji: '🥇', color: 0xf1c40f },
  { name: 'Platinum', min: 1000, max: 1799,       emoji: '💠', color: 0x1abc9c },
  { name: 'Diamond',  min: 1800, max: 2999,       emoji: '💎', color: 0x3498db },
  { name: 'Mythic',   min: 3000, max: Infinity,   emoji: '👑', color: 0x9b59b6 },
];

// RP pack cost
const RP_PACK_COST = 15;

// Rank-up rewards: animals gifted when a player crosses into a new rank
const RANKUP_REWARDS = {
  Silver:   [{ animal: 'Penguin',  amount: 2  }, { animal: 'Fox',    amount: 3  }],
  Gold:     [{ animal: 'Wolf',     amount: 3  }, { animal: 'Eagle',  amount: 2  }],
  Platinum: [{ animal: 'Tiger',    amount: 2  }, { animal: 'Panther',amount: 1  }, { animal: 'Bear', amount: 1 }],
  Diamond:  [{ animal: 'Lion',     amount: 2  }, { animal: 'Elephant', amount: 1 }, { animal: 'Phoenix', amount: 1 }],
  Mythic:   [{ animal: 'Hydra',    amount: 1  }, { animal: 'Kraken', amount: 1  }, { animal: 'Shark', amount: 1 }],
};

function getRank(rp) {
  return RANKS.find(r => rp >= r.min && rp <= r.max) ?? RANKS[0];
}

// RP calculation — factors in rank difference and win streak
function calcRP(winnerRp, loserRp, winStreak) {
  const winnerRankIdx = RANKS.indexOf(getRank(winnerRp));
  const loserRankIdx  = RANKS.indexOf(getRank(loserRp));
  const rankDiff      = loserRankIdx - winnerRankIdx; // positive = beat higher rank

  let gainBase = 30;
  let lossBase = 20;

  if (rankDiff > 0) {
    gainBase = Math.min(60, 30 + rankDiff * 10); // up to +60 for beating higher ranks
    lossBase = Math.max(10, 20 - rankDiff * 3);  // lighter penalty for the higher-rank loser
  } else if (rankDiff < 0) {
    gainBase = Math.max(10, 30 + rankDiff * 8);  // reduced gain for beating lower ranks
    lossBase = Math.min(40, 20 - rankDiff * 5);  // heavier penalty for the lower-rank loser
  }

  // Win streak bonus: +3 RP per consecutive win above 2, capped at +15
  const streakBonus = winStreak >= 3 ? Math.min(15, (winStreak - 2) * 3) : 0;

  return { rpGain: gainBase + streakBonus, rpLoss: lossBase };
}

// Rank decay: 10 RP/day after 7 days of inactivity
function applyDecay(userId) {
  const p = db.prepare('SELECT rp, last_battle FROM profiles WHERE user_id = ?').get(userId);
  if (!p || (p.rp ?? 0) <= 0) return;
  const DAY_MS  = 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - (p.last_battle || 0);
  if (elapsed < 7 * DAY_MS) return;
  const decayDays = Math.floor((elapsed - 7 * DAY_MS) / DAY_MS);
  if (decayDays > 0) {
    db.prepare('UPDATE profiles SET rp = MAX(0, rp - ?) WHERE user_id = ?').run(decayDays * 10, userId);
  }
}

// ─── ANIMALS ─────────────────────────────────────────────────────────────────
const ANIMALS = [
  { name: 'Mouse',       pts: 1,   rarity: 'Common',    emoji: '🐭', weight: 110  },
  { name: 'Rabbit',      pts: 2,   rarity: 'Common',    emoji: '🐰', weight: 100  },
  { name: 'Hamster',     pts: 2,   rarity: 'Common',    emoji: '🐹', weight: 95   },
  { name: 'Frog',        pts: 4,   rarity: 'Common',    emoji: '🐸', weight: 85   },
  { name: 'Fox',         pts: 3,   rarity: 'Common',    emoji: '🦊', weight: 88   },
  { name: 'Duck',        pts: 4,   rarity: 'Common',    emoji: '🦆', weight: 80   },
  { name: 'Penguin',     pts: 5,   rarity: 'Common',    emoji: '🐧', weight: 78   },
  { name: 'Turtle',      pts: 5,   rarity: 'Common',    emoji: '🐢', weight: 75   },
  { name: 'Wolf',        pts: 7,   rarity: 'Uncommon',  emoji: '🐺', weight: 58   },
  { name: 'Eagle',       pts: 8,   rarity: 'Uncommon',  emoji: '🦅', weight: 52   },
  { name: 'Panther',     pts: 12,  rarity: 'Uncommon',  emoji: '🐆', weight: 46   },
  { name: 'Hyena',       pts: 11,  rarity: 'Uncommon',  emoji: '🦡', weight: 44   },
  { name: 'Tiger',       pts: 10,  rarity: 'Uncommon',  emoji: '🐯', weight: 47   },
  { name: 'Bear',        pts: 15,  rarity: 'Uncommon',  emoji: '🐻', weight: 40   },
  { name: 'Lion',        pts: 20,  rarity: 'Rare',      emoji: '🦁', weight: 30   },
  { name: 'Hippo',       pts: 25,  rarity: 'Rare',      emoji: '🦛', weight: 22   },
  { name: 'Gorilla',     pts: 25,  rarity: 'Rare',      emoji: '🦍', weight: 24   },
  { name: 'Crocodile',   pts: 30,  rarity: 'Rare',      emoji: '🐊', weight: 20   },
  { name: 'Grizzly',     pts: 32,  rarity: 'Rare',      emoji: '🐻‍❄️', weight: 17   },
  { name: 'Elephant',    pts: 35,  rarity: 'Rare',      emoji: '🐘', weight: 16   },
  { name: 'Komodo',      pts: 42,  rarity: 'Epic',      emoji: '🦎', weight: 11   },
  { name: 'Shark',       pts: 40,  rarity: 'Epic',      emoji: '🦈', weight: 12   },
  { name: 'Rhino',       pts: 45,  rarity: 'Epic',      emoji: '🦏', weight: 10   },
  { name: 'Orca',        pts: 55,  rarity: 'Epic',      emoji: '🐋', weight: 7    },
  { name: 'T-Rex',       pts: 50,  rarity: 'Epic',      emoji: '🦖', weight: 8    },
  { name: 'Phoenix',     pts: 60,  rarity: 'Epic',      emoji: '🔥', weight: 6    },
  { name: 'Manticore',   pts: 75,  rarity: 'Legendary', emoji: '🦁', weight: 2.8  },
  { name: 'Unicorn',     pts: 70,  rarity: 'Legendary', emoji: '🦄', weight: 3.5  },
  { name: 'Griffin',     pts: 80,  rarity: 'Legendary', emoji: '🦅', weight: 2.5  },
  { name: 'Thunderbird', pts: 88,  rarity: 'Legendary', emoji: '⚡', weight: 2.0  },
  { name: 'Pegasus',     pts: 90,  rarity: 'Legendary', emoji: '✨', weight: 1.8  },
  { name: 'Dragon',      pts: 100, rarity: 'Legendary', emoji: '🐉', weight: 1.5  },
  { name: 'Hydra',       pts: 120, rarity: 'Mythic',    emoji: '🐲', weight: 1.0  },
  { name: 'Kraken',      pts: 140, rarity: 'Mythic',    emoji: '🦑', weight: 0.7  },
  { name: 'Cerberus',    pts: 160, rarity: 'Mythic',    emoji: '👁️',  weight: 0.4  },
  { name: 'Leviathan',   pts: 180, rarity: 'Mythic',    emoji: '🌊', weight: 0.25 },
  { name: 'Fenrir',      pts: 200, rarity: 'Mythic',    emoji: '🐺', weight: 0.15 },
  { name: 'Bahamut',     pts: 250, rarity: 'Divine',    emoji: '🌟', weight: 0.08 },
  { name: 'Apocalypse',  pts: 300, rarity: 'Divine',    emoji: '☄️',  weight: 0.05 },
  { name: 'Void Dragon', pts: 500, rarity: 'Divine',    emoji: '🌌', weight: 0.02 },
  { name: 'Celestial',   pts: 500, rarity: 'Divine',    emoji: '🌠', weight: 0.01 },
  { name: 'Abyss Nemesis',  pts: 750, rarity: 'Divine',    emoji: '🕳️',  weight: 0.005},
];

const RARITY_COLORS = {
  Common:    0x95a5a6,
  Uncommon:  0x2ecc71,
  Rare:      0x3498db,
  Epic:      0x9b59b6,
  Legendary: 0xf1c40f,
  Mythic:    0xe74c3c,
  Divine:    0xffffff,
};

const ANIMAL_MAP   = Object.fromEntries(ANIMALS.map(a => [a.name.toLowerCase(), a]));
const TOTAL_WEIGHT = ANIMALS.reduce((s, a) => s + a.weight, 0);

function pullRandomAnimal() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const a of ANIMALS) { r -= a.weight; if (r <= 0) return a; }
  return ANIMALS[0];
}

// ─── STARTER KIT ─────────────────────────────────────────────────────────────
const STARTER_KIT = [
  { animal: 'Mouse',  amount: 10 },
  { animal: 'Turtle', amount: 5  },
  { animal: 'Tiger',  amount: 1  },
];

// ─── DB HELPERS ──────────────────────────────────────────────────────────────
const UPSERT_SQL = `
  INSERT INTO inventory (user_id, animal, amount) VALUES (?, ?, ?)
  ON CONFLICT(user_id, animal) DO UPDATE SET amount = amount + excluded.amount
`;

function ensureProfile(userId) {
  const exists = db.prepare('SELECT 1 FROM profiles WHERE user_id = ?').get(userId);
  if (!exists) {
    db.prepare('INSERT OR IGNORE INTO profiles (user_id, rp, streak, last_battle) VALUES (?, 0, 0, 0)').run(userId);
    for (const { animal, amount } of STARTER_KIT) {
      db.prepare(UPSERT_SQL).run(userId, animal, amount);
    }
  }
  applyDecay(userId);
}

const upsertInventory = db.prepare(UPSERT_SQL);

function removeFromInventory(userId, animalName, amount) {
  const row = db.prepare('SELECT amount FROM inventory WHERE user_id = ? AND animal = ?').get(userId, animalName);
  if (!row || row.amount < amount) return false;
  db.prepare('UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND animal = ?').run(amount, userId, animalName);
  return true;
}

function getInventory(userId) {
  return db.prepare('SELECT animal, amount FROM inventory WHERE user_id = ? AND amount > 0').all(userId);
}

// ─── ACTIVE BATTLES ──────────────────────────────────────────────────────────
// Keyed ONLY by channel.id. The !1v1 point handler checks activeBattles.get(channel.id),
// so there is ZERO cross-channel interference — the root cause of the old bug.
const activeBattles = new Map();

// ─── DISPLAY NAME ─────────────────────────────────────────────────────────────
async function getDisplayName(guild, user) {
  try { return (await guild.members.fetch(user.id)).displayName; }
  catch { return user.username; }
}

// ─── CANVAS BATTLE IMAGE ─────────────────────────────────────────────────────
async function buildBattleImage(challengerUser, opponentUser, guild) {
  let createCanvas, loadImage;
  try { ({ createCanvas, loadImage } = require('@napi-rs/canvas')); }
  catch { return null; }

  const W = 900, H = 400;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Split background
  ctx.fillStyle = '#c0392b'; ctx.fillRect(0,     0, W / 2, H);
  ctx.fillStyle = '#2471a3'; ctx.fillRect(W / 2, 0, W / 2, H);

  // Rays
  for (const [cx, cy] of [[W * 0.25, H * 0.5], [W * 0.75, H * 0.5]]) {
    ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 700, cy + Math.sin(a) * 700); ctx.stroke();
    }
    ctx.restore();
  }

  // Divider
  ctx.save(); ctx.fillStyle = '#111'; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 18, 0); ctx.lineTo(W / 2 + 18, 0);
  ctx.lineTo(W / 2 + 10, H); ctx.lineTo(W / 2 - 10, H);
  ctx.closePath(); ctx.fill(); ctx.restore();

  // VS text
  ctx.save(); ctx.font = 'bold 52px Arial'; ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 12;
  ctx.fillText('VS', W / 2, H / 2); ctx.restore();

  const challName = await getDisplayName(guild, challengerUser);
  const oppName   = await getDisplayName(guild, opponentUser);
  const avatarR   = 110;
  const avatarY   = Math.round(H * 0.57);
  const positions = [[Math.round(W * 0.25), avatarY, challengerUser, challName],
                     [Math.round(W * 0.75), avatarY, opponentUser,   oppName]];

  for (const [cx, cy, user, label] of positions) {
    // Avatar
    try {
      const img = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, avatarR + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, avatarR, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, cx - avatarR, cy - avatarR, avatarR * 2, avatarR * 2); ctx.restore();
    } catch {}

    // Name pill
    const pillH  = 44, pillR = 22, fontSize = 26;
    const midY   = cy - avatarR - 22;
    ctx.font = `bold ${fontSize}px Arial`;
    const lbl  = label.length > 16 ? label.slice(0, 15) + '…' : label;
    const tw   = ctx.measureText(lbl).width;
    const pw   = tw + 36, px = cx - pw / 2;
    const pt   = midY - pillH / 2, pb = midY + pillH / 2;
    ctx.save(); ctx.globalAlpha = 0.78; ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(px + pillR, pt); ctx.lineTo(px + pw - pillR, pt);
    ctx.arcTo(px + pw, pt, px + pw, pt + pillR, pillR);
    ctx.lineTo(px + pw, pb - pillR); ctx.arcTo(px + pw, pb, px + pw - pillR, pb, pillR);
    ctx.lineTo(px + pillR, pb); ctx.arcTo(px, pb, px, pb - pillR, pillR);
    ctx.lineTo(px, pt + pillR); ctx.arcTo(px, pt, px + pillR, pt, pillR);
    ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.font = `bold ${fontSize}px Arial`; ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6;
    ctx.fillText(lbl, cx, midY); ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

// ─── BATTLE EMBED ─────────────────────────────────────────────────────────────
function buildBattleEmbed(state, imageAttached = false) {
  const { challName, oppName, challenger, opponent, points, endTime } = state;
  const remaining = Math.max(0, endTime - Date.now());
  const cp = points[challenger.id], op = points[opponent.id];
  const total = cp + op;
  const filled = total === 0 ? 5 : Math.round((cp / total) * 10);
  const bar = '🟥'.repeat(filled) + '🟦'.repeat(10 - filled);

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c).setTitle('⚔️  CLOUT 1v1 IN PROGRESS')
    .addFields(
      { name: `🔴 ${challName}`, value: `**${cp} pts**`, inline: true },
      { name: '',                 value: bar,             inline: true },
      { name: `🔵 ${oppName}`,   value: `**${op} pts**`, inline: true },
    )
    .setFooter({ text: `⏱️ ${formatTime(remaining)} left  •  !1v1 point @user <amount> <animal>` });

  if (imageAttached) embed.setImage('attachment://battle.png');
  return embed;
}

function formatTime(ms) {
  const s = Math.ceil(ms / 1000), m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// ─── START BATTLE ─────────────────────────────────────────────────────────────
async function startBattle(channel, challenger, opponent) {
  const DURATION = 3 * 60 * 1000;
  const endTime  = Date.now() + DURATION;

  ensureProfile(challenger.id);
  ensureProfile(opponent.id);

  const challName = await getDisplayName(channel.guild, challenger);
  const oppName   = await getDisplayName(channel.guild, opponent);

  const state = {
    challenger, opponent, challName, oppName,
    points: { [challenger.id]: 0, [opponent.id]: 0 },
    endTime, intervalId: null, battleMsg: null, hasImage: false,
  };

  activeBattles.set(channel.id, state);

  let imageBuffer = null;
  try { imageBuffer = await buildBattleImage(challenger, opponent, channel.guild); } catch {}
  state.hasImage = !!imageBuffer;

  const files = imageBuffer ? [new AttachmentBuilder(imageBuffer, { name: 'battle.png' })] : [];
  const msg   = await channel.send({ embeds: [buildBattleEmbed(state, state.hasImage)], files });
  state.battleMsg = msg;

  state.intervalId = setInterval(async () => {
    if (Date.now() >= state.endTime) {
      clearInterval(state.intervalId);
      activeBattles.delete(channel.id);
      endBattle(channel, state);
      return;
    }
    await msg.edit({ embeds: [buildBattleEmbed(state, false)] }).catch(() => {});
  }, 15_000);

  setTimeout(() => {
    if (activeBattles.has(channel.id)) {
      clearInterval(state.intervalId);
      activeBattles.delete(channel.id);
      endBattle(channel, state);
    }
  }, DURATION + 3000);
}

// ─── END BATTLE ───────────────────────────────────────────────────────────────
async function endBattle(channel, state) {
  const { challenger, opponent, challName, oppName, points } = state;
  const cp = points[challenger.id], op = points[opponent.id];
  const now = Date.now();

  if (cp === op) {
    for (const uid of [challenger.id, opponent.id]) {
      db.prepare('UPDATE profiles SET losses = losses + 1, streak = 0, last_battle = ? WHERE user_id = ?').run(now, uid);
    }
    return channel.send({
      embeds: [
        new EmbedBuilder().setColor(0x95a5a6).setTitle('💀 Both fighters failed to impress the crowd!')
          .setDescription(`**${challName}** — ${cp} pts\n**${oppName}** — ${op} pts\n\nTied. Both get **+1 loss**. No RP changes.`),
      ],
    });
  }

  const isChallWinner = cp > op;
  const [winner, loser, winPts, losePts, winName, loseName] = isChallWinner
    ? [challenger, opponent, cp, op, challName, oppName]
    : [opponent, challenger, op, cp, oppName, challName];

  const wp = db.prepare('SELECT rp, streak FROM profiles WHERE user_id = ?').get(winner.id) ?? { rp: 0, streak: 0 };
  const lp = db.prepare('SELECT rp, streak FROM profiles WHERE user_id = ?').get(loser.id)  ?? { rp: 0, streak: 0 };

  const newStreak  = Math.max(0, wp.streak) + 1;
  const { rpGain, rpLoss } = calcRP(wp.rp, lp.rp, newStreak);
  const newWinRP  = wp.rp + rpGain;
  const newLoseRP = Math.max(0, lp.rp - rpLoss);

  const rankBefore = getRank(wp.rp);
  const rankAfter  = getRank(newWinRP);
  const rankUp     = RANKS.indexOf(rankAfter) > RANKS.indexOf(rankBefore);

  db.prepare('UPDATE profiles SET wins = wins + 1, rp = ?, streak = ?, last_battle = ? WHERE user_id = ?')
    .run(newWinRP, newStreak, now, winner.id);
  db.prepare('UPDATE profiles SET losses = losses + 1, rp = ?, streak = ?, last_battle = ? WHERE user_id = ?')
    .run(newLoseRP, Math.min(-1, (lp.streak < 0 ? lp.streak : 0) - 1), now, loser.id);

  let desc = `**${winName}** wins with **${winPts} pts**!\n${loseName} scored ${losePts} pts.\n\n`;
  desc += `${rankAfter.emoji} **${winName}**: \`+${rpGain} RP\` → **${newWinRP} RP**`;
  if (newStreak >= 2) desc += ` *(${newStreak}🔥 win streak)*`;
  desc += `\n💔 **${loseName}**: \`-${rpLoss} RP\` → **${newLoseRP} RP**`;
  if (rankUp) desc += `\n\n🎉 **${winName}** ranked up to **${rankAfter.emoji} ${rankAfter.name}**!`;

  await channel.send({
    embeds: [
      new EmbedBuilder().setColor(rankAfter.color).setTitle('🏆 Battle Over!')
        .setDescription(desc).setThumbnail(winner.displayAvatarURL()),
    ],
  });

  // ── Rank-up reward ────────────────────────────────────────────────────────
  if (rankUp && RANKUP_REWARDS[rankAfter.name]) {
    const rewards = RANKUP_REWARDS[rankAfter.name];
    for (const { animal, amount } of rewards) {
      upsertInventory.run(winner.id, animal, amount);
    }
    const rewardLines = rewards.map(({ animal, amount }) => {
      const a = ANIMAL_MAP[animal.toLowerCase()];
      return `${a?.emoji ?? '🐾'} **${amount}× ${animal}**`;
    }).join('\n');

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(rankAfter.color)
          .setTitle(`🎁 Rank-Up Reward — ${rankAfter.emoji} ${rankAfter.name}`)
          .setDescription(
            `Congrats **${winName}**! You've reached **${rankAfter.emoji} ${rankAfter.name}**.\n\n` +
            `Here are your rank-up rewards:\n${rewardLines}`
          )
          .setThumbnail(winner.displayAvatarURL()),
      ],
    });
  }
}

// ─── BUTTON HANDLER ───────────────────────────────────────────────────────────
async function handleButtonInteraction(interaction) {
  const { customId, user, channel, guild } = interaction;
  if (!customId.startsWith('1v1_accept_') && !customId.startsWith('1v1_deny_')) return;

  const parts   = customId.split('_');
  const action  = parts[1], challId = parts[2], oppId = parts[3];

  if (user.id !== oppId)
    return interaction.reply({ content: 'This challenge is not for you.', ephemeral: true });

  const key     = `${challId}_${oppId}`;
  const pending = channel.client._1v1Challenges?.get(key);
  if (!pending)
    return interaction.reply({ content: 'Challenge not found or already expired.', ephemeral: true });

  clearTimeout(pending.expireTimeout);
  channel.client._1v1Challenges.delete(key);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('d1').setLabel('✅ Accept').setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId('d2').setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(true),
  );

  if (action === 'deny') {
    const userName = await getDisplayName(guild, user).catch(() => user.username);
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('❌ Challenge Denied').setDescription(`**${userName}** said no.`)],
      components: [disabledRow],
    });
  }

  await interaction.update({
    embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('✅ Challenge Accepted!').setDescription('The battle is starting…')],
    components: [disabledRow],
  });

  const challenger = await guild.members.fetch(challId).then(m => m.user).catch(() => null);
  if (!challenger) return;
  startBattle(channel, challenger, user);
}

// ─── COMMAND ROUTER ───────────────────────────────────────────────────────────
const name    = '1v1';
const aliases = []; // all routing is done via !1v1 <sub>

async function execute(client, message, args) {
  const sub = args[0]?.toLowerCase();

  if (sub === 'point')                       return handlePoint(message, args.slice(1));
  if (sub === 'help')                        return handleHelp(message);
  if (sub === 'pack')                        return handlePack(message, args);
  if (sub === 'inventory' || sub === 'inv')  return handleInventory(message);
  if (sub === 'profile')                     return handleProfile(message, args);
  if (sub === 'leaderboard' || sub === 'lb') return handleLeaderboard(message);
  if (sub === 'rank')                        return handleRank(message, args);
  if (sub === 'reset')                       return handleReset(message, args);
  if (sub === 'animals')                     return handleAnimals(message, args);
  if (sub === 'daily')                       return handleDaily(message);
  if (sub === 'resetcd')                     return handleAdminResetCD(message, args);
  if (sub === 'gift')                        return handleAdminGift(message, args);
  if (sub === 'addrp')                       return handleAdminAddRP(message, args);
  if (sub === 'rppack')                      return handleRPPack(message);

  // Try to resolve as a challenge target (mention or ID)
  const target =
    message.mentions.users.first() ||
    (args[0] ? await message.guild.members.fetch(args[0]).then(m => m?.user).catch(() => null) : null);

  if (target) return handleChallenge(message, target);
  // Unknown subcommand or bare !1v1 — silently ignore
}

// ─── HELP ─────────────────────────────────────────────────────────────────────
async function handleHelp(message) {
  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0xe74c3c).setTitle('⚔️  Clout 1v1 — Help')
        .setDescription('Two players fight for 3 minutes while the chat sends them animals as points.')
        .addFields(
          { name: '🥊 Fighting',       value: '`!1v1 @user` — Challenge someone (60s to accept)\n`!1v1 point @user <amount> <animal>` — Gift points during a battle (15s cooldown)' },
          { name: '📦 Packs & Daily',  value: '`!1v1 pack` — Open 1 pack (5 animals, up to 2/day)\n`!1v1 rppack` — Spend **15 RP** for 1 pack (1/day)\n`!1v1 daily` — 1 free animal per day\n`!1v1 inventory` — View your animals' },
          { name: '📊 Stats & Rank',   value: '`!1v1 rank` — Your rank & RP\n`!1v1 rank @user` — View someone\'s rank\n`!1v1 profile` — W/L record\n`!1v1 leaderboard` — Top ranked, fighters & gifters' },
          { name: '🐾 Animals',        value: '`!1v1 animals` — All animals & point values\n`!1v1 animals <rarity>` — Filter by rarity' },
          { name: '🔧 Other',          value: '`!1v1 reset` — Reset your own W/L & streak' },
          { name: '🐾 Rarities',       value: '🩶 Common · 💚 Uncommon · 💙 Rare · 💜 Epic · 💛 Legendary · ❤️ Mythic · 🤍 Divine' },
          { name: '🏅 Ranks',          value: '🥉 Bronze → 🥈 Silver → 🥇 Gold → 💠 Platinum → 💎 Diamond → 👑 Mythic' },
          { name: '🎁 Starter Kit',    value: '10× Mouse, 5× Turtle, 1× Tiger' },
        )
        .setFooter({ text: 'Example: !1v1 point @Astrix 2 Dragon  →  gifts Astrix 200 pts (100 per Dragon)' }),
    ],
  });
}

// ─── CHALLENGE ────────────────────────────────────────────────────────────────
async function handleChallenge(message, target) {
  const { author, channel } = message;
  if (target.id === author.id) return message.reply("You can't fight yourself 💀");
  if (target.bot)              return message.reply("Bots don't fight.");
  if (activeBattles.has(channel.id))
    return message.reply('There\'s already an active battle in this channel!');
  for (const [, battle] of activeBattles) {
    if (battle.challenger.id === author.id || battle.opponent.id === author.id)
      return message.reply('You\'re already in an active battle somewhere else!');
    if (battle.challenger.id === target.id || battle.opponent.id === target.id)
      return message.reply(`${target.username} is already in an active battle!`);
  }

  const authName = await getDisplayName(channel.guild, author);
  const targName = await getDisplayName(channel.guild, target);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`1v1_accept_${author.id}_${target.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`1v1_deny_${author.id}_${target.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
  );

  const embed = new EmbedBuilder().setColor(0xe74c3c).setTitle('⚔️  Fight Challenge!')
    .setDescription(`**${authName}** challenged **${targName}** to a Clout 1v1!\n\n<@${target.id}>, do you accept?\n\n*Expires in 60 seconds.*`)
    .setThumbnail(author.displayAvatarURL());

  const msg = await channel.send({ content: `<@${target.id}>`, embeds: [embed], components: [row] });

  const expireTimeout = setTimeout(async () => {
    const expired = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('e1').setLabel('✅ Accept').setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId('e2').setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(true),
    );
    await msg.edit({
      embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('⏰ Challenge Expired').setDescription(`**${authName}** vs **${targName}** — no response.`)],
      components: [expired],
    }).catch(() => {});
    channel.client._1v1Challenges?.delete(`${author.id}_${target.id}`);
  }, 60_000);

  if (!channel.client._1v1Challenges) channel.client._1v1Challenges = new Map();
  channel.client._1v1Challenges.set(`${author.id}_${target.id}`, { msg, expireTimeout });
}

// ─── POINT ────────────────────────────────────────────────────────────────────
// Usage: !1v1 point @user <amount> <animal>
// args here is already sliced past 'point': [mention/id, amount, animal...]
async function handlePoint(message, args) {
  const { author, channel } = message;

  // ── ONLY check the battle in THIS channel ────────────────────────────────
  const battle = activeBattles.get(channel.id);
  if (!battle) return message.reply('No active battle in this channel right now.');

  // ── Fighters block ───────────────────────────────────────────────────────
  if (author.id === battle.challenger.id || author.id === battle.opponent.id) {
    return message.reply({
      embeds: [
        new EmbedBuilder().setColor(0xe74c3c)
          .setDescription('❌ **You cannot give points during a 1v1.**\nAs a fighter, sit tight and let the crowd support you!'),
      ],
    });
  }

  // ── Resolve target (mention or raw ID) ───────────────────────────────────
  const target = message.mentions.users.first() ??
    (args[0] ? await message.guild.members.fetch(args[0].replace(/\D/g, '')).then(m => m?.user).catch(() => null) : null);

  if (!target) return message.reply('Mention a battler or use their ID. `!1v1 point @user <amount> <animal>`');
  if (target.id !== battle.challenger.id && target.id !== battle.opponent.id)
    return message.reply("That person isn't in the current battle.");

  // ── Parse amount & animal ────────────────────────────────────────────────
  // args = [mention/id, amount, animal...]  — amount is always index 1
  const amount = parseInt(args[1]);
  if (!amount || amount < 1) return message.reply('Specify a valid amount. `!1v1 point @user <amount> <animal>`');

  const animalName = args.slice(2).join(' ').trim();
  if (!animalName) return message.reply('Specify an animal. `!1v1 point @user <amount> <animal>`');

  const animal = ANIMAL_MAP[animalName.toLowerCase()];
  if (!animal) return message.reply(`Unknown animal **${animalName}**. Check \`!1v1 inventory\` for your animals.`);

  // ── 15s cooldown ─────────────────────────────────────────────────────────
  const cdRow   = db.prepare('SELECT last_point FROM point_cooldowns WHERE user_id = ?').get(author.id);
  const elapsed = Date.now() - (cdRow?.last_point || 0);
  if (elapsed < 15_000) {
    const left = Math.ceil((15_000 - elapsed) / 1000);
    return message.reply(`⏳ Cooldown! Wait **${left}s** before gifting again.`);
  }

  ensureProfile(author.id);

  if (!removeFromInventory(author.id, animal.name, amount))
    return message.reply(`You don't have ${amount}× **${animal.name}**. Check \`!1v1 inventory\`.`);

  const totalPts = amount * animal.pts;
  battle.points[target.id] += totalPts;

  db.prepare('UPDATE profiles SET points_gifted = points_gifted + ? WHERE user_id = ?').run(totalPts, author.id);
  db.prepare('INSERT OR REPLACE INTO point_cooldowns (user_id, last_point) VALUES (?, ?)').run(author.id, Date.now());

  const gifterName = await getDisplayName(channel.guild, author);
  const targetName = target.id === battle.challenger.id ? battle.challName : battle.oppName;

  return channel.send({
    embeds: [
      new EmbedBuilder().setColor(RARITY_COLORS[animal.rarity] ?? 0x2ecc71)
        .setDescription(
          `${animal.emoji} **${gifterName}** gifted **${targetName}** ` +
          `${amount}× **${animal.name}** *(${totalPts} pts)*\n` +
          `${targetName}'s current points: **${battle.points[target.id]}**`
        ),
    ],
  });
}

// ─── PACK ─────────────────────────────────────────────────────────────────────
async function handlePack(message, args) {
  const { author } = message;
  ensureProfile(author.id);

  const CD_MS       = 24 * 60 * 60 * 1000;
  const MAX_PACKS   = 2;
  const ANIMALS_PER = 5;
  const now         = Date.now();

  let cdRow = db.prepare('SELECT * FROM pack_cooldowns WHERE user_id = ?').get(author.id);
  if (!cdRow || (now - cdRow.window_start) >= CD_MS) {
    db.prepare(`INSERT INTO pack_cooldowns (user_id, window_start, packs_used) VALUES (?, ?, 0)
      ON CONFLICT(user_id) DO UPDATE SET window_start = excluded.window_start, packs_used = 0`).run(author.id, now);
    cdRow = { window_start: now, packs_used: 0 };
  }

  const packsLeft = MAX_PACKS - cdRow.packs_used;
  if (packsLeft <= 0) {
    const left = CD_MS - (now - cdRow.window_start);
    return message.reply(`⏳ You've used all **${MAX_PACKS} packs** for today. Resets in **${Math.floor(left / 3_600_000)}h ${Math.floor((left % 3_600_000) / 60_000)}m**.`);
  }

  const rawAmount = parseInt(args[1]);
  if (args[1] && (isNaN(rawAmount) || rawAmount < 1))
    return message.reply(`❌ Specify 1 or 2. Usage: \`!1v1 pack [1-${MAX_PACKS}]\``);

  const packCount = Math.min(!rawAmount || rawAmount < 1 ? 1 : rawAmount, packsLeft);
  const allPulled = [];
  for (let p = 0; p < packCount; p++) {
    const pack = Array.from({ length: ANIMALS_PER }, pullRandomAnimal);
    allPulled.push(pack);
    for (const a of pack) upsertInventory.run(author.id, a.name, 1);
  }

  const newUsed   = cdRow.packs_used + packCount;
  db.prepare('UPDATE pack_cooldowns SET packs_used = ? WHERE user_id = ?').run(newUsed, author.id);

  const remaining = MAX_PACKS - newUsed;
  const sections  = allPulled.map((pack, i) =>
    `**Pack ${cdRow.packs_used + i + 1}:**\n${pack.map(a => `  ${a.emoji} **${a.name}** — ${a.pts} pts \`${a.rarity}\``).join('\n')}`
  ).join('\n\n');

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0x9b59b6)
        .setTitle(`📦 Opened ${packCount} Pack${packCount > 1 ? 's' : ''}! (${packCount * ANIMALS_PER} animals)`)
        .setDescription(sections)
        .setFooter({ text: remaining > 0 ? `${remaining} pack${remaining !== 1 ? 's' : ''} remaining today` : 'All 2 packs used! Resets in 24h' }),
    ],
  });
}

// ─── DAILY ────────────────────────────────────────────────────────────────────
async function handleDaily(message) {
  const { author } = message;
  ensureProfile(author.id);

  const DAY_MS  = 24 * 60 * 60 * 1000;
  const now     = Date.now();
  const row     = db.prepare('SELECT last_daily FROM daily_cooldowns WHERE user_id = ?').get(author.id);
  const elapsed = now - (row?.last_daily || 0);

  if (elapsed < DAY_MS) {
    const left = DAY_MS - elapsed;
    return message.reply(`⏳ Already claimed today! Come back in **${Math.floor(left / 3_600_000)}h ${Math.floor((left % 3_600_000) / 60_000)}m**.`);
  }

  const animal = pullRandomAnimal();
  upsertInventory.run(author.id, animal.name, 1);
  db.prepare('INSERT OR REPLACE INTO daily_cooldowns (user_id, last_daily) VALUES (?, ?)').run(author.id, now);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(RARITY_COLORS[animal.rarity] ?? 0x2ecc71)
        .setTitle('🎁 Daily Animal!')
        .setDescription(`You received: ${animal.emoji} **${animal.name}** — ${animal.pts} pts \`${animal.rarity}\`\n\nCome back tomorrow for another one!`)
        .setFooter({ text: 'Tip: !1v1 pack for 5 animals at once (2 packs/day)' }),
    ],
  });
}

// ─── ANIMALS LIST ─────────────────────────────────────────────────────────────
async function handleAnimals(message, args) {
  const rarityOrder   = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Divine'];
  const filterRarity  = args[1] ? rarityOrder.find(r => r.toLowerCase() === args[1].toLowerCase()) : null;
  const raritiesShown = filterRarity ? [filterRarity] : rarityOrder;

  const fields = raritiesShown.map(rarity => ({
    name:  rarity,
    value: ANIMALS.filter(a => a.rarity === rarity).map(a => `${a.emoji} **${a.name}** — ${a.pts} pts`).join('\n') || 'None',
    inline: false,
  }));

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0x9b59b6)
        .setTitle('🐾 All Animals & Point Values')
        .setDescription('Use `!1v1 point @user <amount> <animal>` during a battle.')
        .addFields(fields)
        .setFooter({ text: 'Filter: !1v1 animals rare' }),
    ],
  });
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
async function handleInventory(message) {
  const { author, guild } = message;
  ensureProfile(author.id);

  const inv = getInventory(author.id);
  if (!inv.length) return message.reply('Your inventory is empty! Use `!1v1 pack` or `!1v1 daily`.');

  const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Divine'];
  const grouped = {};
  for (const row of inv) {
    const a = ANIMAL_MAP[row.animal.toLowerCase()];
    if (!a) continue;
    if (!grouped[a.rarity]) grouped[a.rarity] = [];
    grouped[a.rarity].push(`${a.emoji} **${row.animal}** ×${row.amount} *(${a.pts} pts each)*`);
  }

  const fields = rarityOrder.filter(r => grouped[r]).map(r => ({ name: r, value: grouped[r].join('\n'), inline: false }));

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0x3498db)
        .setTitle(`🎒 ${await getDisplayName(guild, author)}'s Inventory`)
        .addFields(fields).setThumbnail(author.displayAvatarURL()),
    ],
  });
}

// ─── RANK ─────────────────────────────────────────────────────────────────────
async function handleRank(message, args) {
  const { author, guild } = message;

  let target = message.mentions.users.first();
  if (!target && args[1]) target = await guild.members.fetch(args[1].replace(/\D/g, '')).then(m => m?.user).catch(() => null);
  target = target || author;

  ensureProfile(target.id);
  const p    = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(target.id);
  const rp   = p.rp ?? 0;
  const rank = getRank(rp);
  const next = RANKS[RANKS.indexOf(rank) + 1];

  let progressStr = '';
  if (next) {
    const progress = rp - rank.min, needed = next.min - rank.min;
    const filled   = Math.min(10, Math.round((progress / needed) * 10));
    progressStr = `\n\n**Progress to ${next.emoji} ${next.name}:**\n\`${'█'.repeat(filled)}${'░'.repeat(10 - filled)}\` ${rp} / ${next.min} RP`;
  } else {
    progressStr = '\n\n*You\'ve reached the highest rank!* 👑';
  }

  const total     = p.wins + p.losses;
  const wr        = total > 0 ? ((p.wins / total) * 100).toFixed(1) : '0.0';
  const streakStr = p.streak > 0 ? `🔥 ${p.streak}-win streak` : p.streak < 0 ? `❄️ ${Math.abs(p.streak)}-loss streak` : 'No streak';
  const displayName = await getDisplayName(guild, target);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(rank.color)
        .setTitle(`${rank.emoji} ${displayName}'s Rank`)
        .setThumbnail(target.displayAvatarURL())
        .setDescription(`**${rank.emoji} ${rank.name}** — **${rp} RP**${progressStr}`)
        .addFields(
          { name: '🏆 Wins',     value: `${p.wins}`,   inline: true },
          { name: '💀 Losses',   value: `${p.losses}`,  inline: true },
          { name: '📊 Win Rate', value: `${wr}%`,       inline: true },
          { name: '⚡ Streak',    value: streakStr,      inline: true },
        ),
    ],
  });
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
async function handleProfile(message, args) {
  const { author, guild } = message;

  let target = message.mentions.users.first();
  if (!target && args[1]) target = await guild.members.fetch(args[1].replace(/\D/g, '')).then(m => m?.user).catch(() => null);
  target = target || author;

  ensureProfile(target.id);
  const p           = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(target.id);
  const total       = p.wins + p.losses;
  const wr          = total > 0 ? ((p.wins / total) * 100).toFixed(1) : '0.0';
  const rank        = getRank(p.rp ?? 0);
  const displayName = await getDisplayName(guild, target);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(rank.color).setTitle(`⚔️  ${displayName}'s Profile`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '🏅 Rank',          value: `${rank.emoji} ${rank.name} (${p.rp ?? 0} RP)`, inline: true },
          { name: '🏆 Wins',          value: `${p.wins}`,          inline: true },
          { name: '💀 Losses',        value: `${p.losses}`,        inline: true },
          { name: '📊 Win Rate',      value: `${wr}%`,             inline: true },
          { name: '🎁 Points Gifted', value: `${p.points_gifted}`, inline: true },
        ),
    ],
  });
}

// ─── RESET ────────────────────────────────────────────────────────────────────
async function handleReset(message, args) {
  const { author, guild } = message;

  let target = message.mentions.users.first();
  if (!target && args[1]) target = await guild.members.fetch(args[1].replace(/\D/g, '')).then(m => m?.user).catch(() => null);
  const isSelf = !target || target.id === author.id;

  if (!isSelf) {
    const member = await guild.members.fetch(author.id).catch(() => null);
    if (!member?.permissions.has('ManageGuild'))
      return message.reply('❌ You need **Manage Server** permission to reset someone else\'s record.');
  }

  const t = isSelf ? author : target;
  ensureProfile(t.id);
  db.prepare('UPDATE profiles SET wins = 0, losses = 0, streak = 0 WHERE user_id = ?').run(t.id);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0xe74c3c).setTitle('🔄 Record Reset')
        .setDescription(`**${await getDisplayName(guild, t)}**'s wins, losses & streak reset to **0**.`)
        .setThumbnail(t.displayAvatarURL()),
    ],
  });
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
async function handleLeaderboard(message) {
  const { guild } = message;

  async function formatRows(rows, valueFn) {
    const medals = ['🥇', '🥈', '🥉'];
    const lines  = [];
    for (let i = 0; i < rows.length; i++) {
      const member = await guild.members.fetch(rows[i].user_id).catch(() => null);
      lines.push(`${medals[i] ?? `${i + 1}.`} ${member?.displayName ?? 'Unknown'} — ${valueFn(rows[i])}`);
    }
    return lines.join('\n') || 'No data yet.';
  }

  const topRP   = db.prepare('SELECT user_id, rp FROM profiles WHERE rp > 0 ORDER BY rp DESC LIMIT 10').all();
  const topWins = db.prepare('SELECT user_id, wins, losses FROM profiles ORDER BY wins DESC LIMIT 10').all();
  const topGift = db.prepare('SELECT user_id, points_gifted FROM profiles ORDER BY points_gifted DESC LIMIT 10').all();

  const [rpText, winsText, giftText] = await Promise.all([
    formatRows(topRP,   r => `${getRank(r.rp).emoji} **${r.rp} RP**`),
    formatRows(topWins, r => `${r.wins}W / ${r.losses}L`),
    formatRows(topGift, r => `${r.points_gifted} pts gifted`),
  ]);

  return message.channel.send({
    embeds: [
      new EmbedBuilder().setColor(0xf1c40f).setTitle('🏆 1v1 Leaderboard')
        .addFields(
          { name: '👑 Top Ranked',   value: rpText,            inline: false },
          { name: '\u200b',          value: '\u200b',           inline: false },
          { name: '🥊 Top Fighters', value: winsText,           inline: false },
          { name: '\u200b',          value: '\u200b',           inline: false },
          { name: '🎁 Top Gifters',  value: giftText,           inline: false },
        ),
    ],
  });
}

// ─── ADMIN: RESET COOLDOWNS ───────────────────────────────────────────────────
// !1v1 resetcd @user
async function handleAdminResetCD(message, args) {
  if (!isAdmin(message.author.id))
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('❌ No permission.')] });

  const target = message.mentions.users.first() ??
    (args[1] ? await message.guild.members.fetch(args[1].replace(/\D/g, '')).then(m => m?.user).catch(() => null) : null);
  if (!target) return message.reply('Specify a user. `!1v1 resetcd @user`');

  db.prepare('DELETE FROM pack_cooldowns  WHERE user_id = ?').run(target.id);
  db.prepare('DELETE FROM point_cooldowns WHERE user_id = ?').run(target.id);
  db.prepare('DELETE FROM daily_cooldowns WHERE user_id = ?').run(target.id);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0x2ecc71).setTitle('✅ Cooldowns Reset')
        .setDescription(`All cooldowns (pack, daily, point) cleared for **${await getDisplayName(message.guild, target)}**.`),
    ],
  });
}

// ─── ADMIN: GIFT ANIMAL ───────────────────────────────────────────────────────
// !1v1 gift @user <animal> <amount>
// Animal can be multi-word (e.g. Void Dragon); amount is always the last argument
async function handleAdminGift(message, args) {
  if (!isAdmin(message.author.id))
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('❌ No permission.')] });

  const target = message.mentions.users.first() ??
    (args[1] ? await message.guild.members.fetch(args[1].replace(/\D/g, '')).then(m => m?.user).catch(() => null) : null);
  if (!target) return message.reply('Specify a user. `!1v1 gift @user <animal> <amount>`');

  const afterUser = args.slice(2);  // everything after 'gift' and the user
  const amount    = parseInt(afterUser[afterUser.length - 1]);
  if (!amount || amount < 1) return message.reply('Amount must be a positive number. `!1v1 gift @user <animal> <amount>`');

  const animalName = afterUser.slice(0, -1).join(' ').trim();
  if (!animalName) return message.reply('Specify an animal. `!1v1 gift @user <animal> <amount>`');

  const animal = ANIMAL_MAP[animalName.toLowerCase()];
  if (!animal) return message.reply(`Unknown animal **${animalName}**.`);

  ensureProfile(target.id);
  upsertInventory.run(target.id, animal.name, amount);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(RARITY_COLORS[animal.rarity] ?? 0x2ecc71)
        .setTitle('🎁 Admin Gift')
        .setDescription(`${animal.emoji} Gifted **${amount}× ${animal.name}** *(${animal.pts * amount} pts total)* to **${await getDisplayName(message.guild, target)}**.`),
    ],
  });
}

// ─── RP PACK ──────────────────────────────────────────────────────────────────
// !1v1 rppack — spend 15 RP for 1 pack of 5 animals, once per day
async function handleRPPack(message) {
  const { author } = message;
  ensureProfile(author.id);

  const p = db.prepare('SELECT rp FROM profiles WHERE user_id = ?').get(author.id);
  if ((p?.rp ?? 0) < RP_PACK_COST) {
    return message.reply({
      embeds: [
        new EmbedBuilder().setColor(0xe74c3c)
          .setTitle('❌ Not Enough RP')
          .setDescription(`You need **${RP_PACK_COST} RP** to buy an RP pack.\nYou currently have **${p?.rp ?? 0} RP**.\n\nEarn RP by winning battles!`),
      ],
    });
  }

  const DAY_MS  = 24 * 60 * 60 * 1000;
  const now     = Date.now();
  const cdRow   = db.prepare('SELECT last_rp_pack FROM rp_pack_cooldowns WHERE user_id = ?').get(author.id);
  const elapsed = now - (cdRow?.last_rp_pack || 0);

  if (elapsed < DAY_MS) {
    const left = DAY_MS - elapsed;
    const h    = Math.floor(left / 3_600_000);
    const m    = Math.floor((left % 3_600_000) / 60_000);
    return message.reply({
      embeds: [
        new EmbedBuilder().setColor(0xe67e22)
          .setTitle('⏳ RP Pack on Cooldown')
          .setDescription(`You already bought an RP pack today. Come back in **${h}h ${m}m**.`),
      ],
    });
  }

  // Deduct RP and pull 5 animals
  db.prepare('UPDATE profiles SET rp = rp - ? WHERE user_id = ?').run(RP_PACK_COST, author.id);
  db.prepare('INSERT OR REPLACE INTO rp_pack_cooldowns (user_id, last_rp_pack) VALUES (?, ?)').run(author.id, now);

  const animals = Array.from({ length: 5 }, pullRandomAnimal);
  for (const a of animals) upsertInventory.run(author.id, a.name, 1);

  const newRP   = (p.rp ?? 0) - RP_PACK_COST;
  const lines   = animals.map(a => `  ${a.emoji} **${a.name}** — ${a.pts} pts \`${a.rarity}\``).join('\n');

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0x9b59b6)
        .setTitle('🎴 RP Pack Opened!')
        .setDescription(`You spent **${RP_PACK_COST} RP** and received:\n\n${lines}`)
        .setFooter({ text: `Remaining RP: ${newRP} • 1 RP pack per day` }),
    ],
  });
}

// ─── ADMIN: ADD RP ────────────────────────────────────────────────────────────
// !1v1 addrp @user <amount>
async function handleAdminAddRP(message, args) {
  if (!isAdmin(message.author.id))
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('❌ No permission.')] });

  const target = message.mentions.users.first() ??
    (args[1] ? await message.guild.members.fetch(args[1].replace(/\D/g, '')).then(m => m?.user).catch(() => null) : null);
  if (!target) return message.reply('Specify a user. `!1v1 addrp @user <amount>`');

  const amount = parseInt(args[2] ?? args[1]);
  if (!amount || isNaN(amount)) return message.reply('Specify an RP amount. `!1v1 addrp @user <amount>`');

  ensureProfile(target.id);

  const before    = db.prepare('SELECT rp FROM profiles WHERE user_id = ?').get(target.id)?.rp ?? 0;
  const newRP     = Math.max(0, before + amount);
  const rankBefore = getRank(before);
  const rankAfter  = getRank(newRP);

  db.prepare('UPDATE profiles SET rp = ? WHERE user_id = ?').run(newRP, target.id);

  // Give rank-up rewards if applicable
  let rewardNote = '';
  if (RANKS.indexOf(rankAfter) > RANKS.indexOf(rankBefore) && RANKUP_REWARDS[rankAfter.name]) {
    const rewards = RANKUP_REWARDS[rankAfter.name];
    for (const { animal, amount: amt } of rewards) upsertInventory.run(target.id, animal, amt);
    rewardNote = `\n🎁 Rank-up rewards for **${rankAfter.name}** granted.`;
  }

  const sign        = amount >= 0 ? '+' : '';
  const displayName = await getDisplayName(message.guild, target);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0x2ecc71).setTitle('⚡ Admin: RP Adjusted')
        .setDescription(
          `**${displayName}**: \`${sign}${amount} RP\`\n` +
          `${rankAfter.emoji} **${before} RP** → **${newRP} RP** (${rankAfter.name})` +
          rewardNote
        ),
    ],
  });
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = { name, aliases, execute, handleButtonInteraction };
