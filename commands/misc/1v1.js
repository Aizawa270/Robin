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
    points_gifted INTEGER DEFAULT 0
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
`);

console.log('[1v1] Database initialized');

// ─── ANIMALS ─────────────────────────────────────────────────────────────────
const ANIMALS = [
  // ── Common ────────────────────────────────────────────────────────────────
  { name: 'Mouse',       pts: 1,   rarity: 'Common',    emoji: '🐭', weight: 110 },
  { name: 'Rabbit',      pts: 2,   rarity: 'Common',    emoji: '🐰', weight: 100 },
  { name: 'Hamster',     pts: 2,   rarity: 'Common',    emoji: '🐹', weight: 95  },
  { name: 'Frog',        pts: 4,   rarity: 'Common',    emoji: '🐸', weight: 85  },
  { name: 'Fox',         pts: 3,   rarity: 'Common',    emoji: '🦊', weight: 88  },
  { name: 'Duck',        pts: 4,   rarity: 'Common',    emoji: '🦆', weight: 80  },
  { name: 'Penguin',     pts: 5,   rarity: 'Common',    emoji: '🐧', weight: 78  },
  { name: 'Turtle',      pts: 5,   rarity: 'Common',    emoji: '🐢', weight: 75  },
  // ── Uncommon ──────────────────────────────────────────────────────────────
  { name: 'Wolf',        pts: 7,   rarity: 'Uncommon',  emoji: '🐺', weight: 58  },
  { name: 'Eagle',       pts: 8,   rarity: 'Uncommon',  emoji: '🦅', weight: 52  },
  { name: 'Panther',     pts: 12,  rarity: 'Uncommon',  emoji: '🐆', weight: 46  },
  { name: 'Hyena',       pts: 11,  rarity: 'Uncommon',  emoji: '🦡', weight: 44  },
  { name: 'Tiger',       pts: 10,  rarity: 'Uncommon',  emoji: '🐯', weight: 47  },
  { name: 'Bear',        pts: 15,  rarity: 'Uncommon',  emoji: '🐻', weight: 40  },
  // ── Rare ──────────────────────────────────────────────────────────────────
  { name: 'Lion',        pts: 20,  rarity: 'Rare',      emoji: '🦁', weight: 30  },
  { name: 'Hippo',       pts: 25,  rarity: 'Rare',      emoji: '🦛', weight: 22  },
  { name: 'Gorilla',     pts: 25,  rarity: 'Rare',      emoji: '🦍', weight: 24  },
  { name: 'Crocodile',   pts: 30,  rarity: 'Rare',      emoji: '🐊', weight: 20  },
  { name: 'Grizzly',     pts: 32,  rarity: 'Rare',      emoji: '🐻‍❄️', weight: 17  },
  { name: 'Elephant',    pts: 35,  rarity: 'Rare',      emoji: '🐘', weight: 16  },
  // ── Epic ──────────────────────────────────────────────────────────────────
  { name: 'Komodo',      pts: 42,  rarity: 'Epic',      emoji: '🦎', weight: 11  },
  { name: 'Shark',       pts: 40,  rarity: 'Epic',      emoji: '🦈', weight: 12  },
  { name: 'Rhino',       pts: 45,  rarity: 'Epic',      emoji: '🦏', weight: 10  },
  { name: 'Orca',        pts: 55,  rarity: 'Epic',      emoji: '🐋', weight: 7   },
  { name: 'T-Rex',       pts: 50,  rarity: 'Epic',      emoji: '🦖', weight: 8   },
  { name: 'Phoenix',     pts: 60,  rarity: 'Epic',      emoji: '🔥', weight: 6   },
  // ── Legendary ─────────────────────────────────────────────────────────────
  { name: 'Manticore',   pts: 75,  rarity: 'Legendary', emoji: '🦁', weight: 2.8 },
  { name: 'Unicorn',     pts: 70,  rarity: 'Legendary', emoji: '🦄', weight: 3.5 },
  { name: 'Griffin',     pts: 80,  rarity: 'Legendary', emoji: '🦅', weight: 2.5 },
  { name: 'Thunderbird', pts: 88,  rarity: 'Legendary', emoji: '⚡', weight: 2.0 },
  { name: 'Pegasus',     pts: 90,  rarity: 'Legendary', emoji: '✨', weight: 1.8 },
  { name: 'Dragon',      pts: 100, rarity: 'Legendary', emoji: '🐉', weight: 1.5 },
  // ── Mythic ────────────────────────────────────────────────────────────────
  { name: 'Hydra',       pts: 120, rarity: 'Mythic',    emoji: '🐲', weight: 1.0 },
  { name: 'Kraken',      pts: 140, rarity: 'Mythic',    emoji: '🦑', weight: 0.7 },
  { name: 'Cerberus',    pts: 160, rarity: 'Mythic',    emoji: '👁️',  weight: 0.4 },
  { name: 'Leviathan',   pts: 180, rarity: 'Mythic',    emoji: '🌊', weight: 0.25},
  { name: 'Fenrir',      pts: 200, rarity: 'Mythic',    emoji: '🐺', weight: 0.15},
  // ── Divine (almost impossible) ────────────────────────────────────────────
  { name: 'Bahamut',     pts: 250, rarity: 'Divine',    emoji: '🌟', weight: 0.08},
  { name: 'Apocalypse',  pts: 300, rarity: 'Divine',    emoji: '☄️',  weight: 0.05},
  { name: 'Void Dragon', pts: 500, rarity: 'Divine',    emoji: '🌌', weight: 0.02},
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
    db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(userId);
    for (const { animal, amount } of STARTER_KIT) {
      db.prepare(UPSERT_SQL).run(userId, animal, amount);
    }
  }
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
const activeBattles = new Map();

// ─── DISPLAY NAME HELPER ─────────────────────────────────────────────────────
async function getDisplayName(guild, user) {
  try {
    const member = await guild.members.fetch(user.id);
    return member.displayName;
  } catch {
    return user.username;
  }
}

// ─── CANVAS BATTLE IMAGE ─────────────────────────────────────────────────────
// Template: https://i.imgur.com/8PTD0Bz.png  (1536 x 1024)
//
// Pixel-exact measurements from the real template:
//   Left  circle: centre x=381 (W×0.248), y=375 (H×0.366), placeholder radius=232
//   Right circle: centre x=1143 (W×0.744), y=375 (H×0.366), same radius
//   [Name] text area: y=58–130, left x=256–507, right x=1016–1269
//
// Strategy:
//   1. Draw avatar at radius=232 → completely covers the pink placeholder
//      circle, the "AVATAR" text inside it, and the outline ring.
//   2. Draw a dark rounded pill over the [Name] text area.
//   3. Write the real username on the pill.
//
const TEMPLATE_URL = 'https://i.imgur.com/8PTD0Bz.png';

async function buildBattleImage(challengerUser, opponentUser, guild) {
  let createCanvas, loadImage;
  try {
    ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
  } catch { return null; }

  let template;
  try { template = await loadImage(TEMPLATE_URL); } catch { return null; }

  const W = template.width;   // 1536
  const H = template.height;  // 1024
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  ctx.drawImage(template, 0, 0, W, H);

  const challName = await getDisplayName(guild, challengerUser);
  const oppName   = await getDisplayName(guild, opponentUser);

  // Circle centres (pixel-measured from template)
  const leftCX   = Math.round(W * 0.2480);  // 381
  const rightCX  = Math.round(W * 0.7441);  // 1143
  const circleCY = Math.round(H * 0.3662);  // 375
  // Full placeholder radius — avatar drawn at this size covers everything
  const avatarR  = 232;

  // ── 1. Draw avatars (cover the entire placeholder circle) ──────────────
  async function drawAvatar(user, cx, cy, radius) {
    try {
      const url = user.displayAvatarURL({ extension: 'png', size: 512 });
      const img = await loadImage(url);
      // Clip to circle and draw avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.restore();
      // Clean circular border
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth   = 5;
      ctx.stroke();
      ctx.restore();
    } catch { /* skip on fail */ }
  }

  await drawAvatar(challengerUser, leftCX,  circleCY, avatarR);
  await drawAvatar(opponentUser,   rightCX, circleCY, avatarR);

  // ── 2. Draw name pills over the [Name] placeholder text ────────────────
  // [Name] text region: y=58–130 (height=72px), centred on x=381 / x=1143
  const pillTopY  = 50;
  const pillBotY  = 138;
  const pillH     = pillBotY - pillTopY;      // 88px
  const pillMidY  = pillTopY + pillH / 2;     // 94px
  const pillR     = pillH / 2;               // corner radius
  const fontSize  = Math.round(pillH * 0.60); // ~53px

  function drawNamePill(cx, name) {
    ctx.font = `bold ${fontSize}px Arial`;
    const trim     = s => s.length > 13 ? s.slice(0, 12) + '…' : s;
    const label    = trim(name);
    const measured = ctx.measureText(label).width;
    const pad      = 20;
    const pillW    = measured + pad * 2;
    const pillX    = cx - pillW / 2;

    // Dark semi-transparent pill background
    ctx.save();
    ctx.globalAlpha = 0.70;
    ctx.fillStyle   = '#000000';
    ctx.beginPath();
    ctx.moveTo(pillX + pillR,       pillTopY);
    ctx.lineTo(pillX + pillW - pillR, pillTopY);
    ctx.arcTo(pillX + pillW, pillTopY, pillX + pillW, pillTopY + pillR, pillR);
    ctx.lineTo(pillX + pillW,       pillBotY - pillR);
    ctx.arcTo(pillX + pillW, pillBotY, pillX + pillW - pillR, pillBotY, pillR);
    ctx.lineTo(pillX + pillR,       pillBotY);
    ctx.arcTo(pillX, pillBotY, pillX, pillBotY - pillR, pillR);
    ctx.lineTo(pillX,               pillTopY + pillR);
    ctx.arcTo(pillX, pillTopY, pillX + pillR, pillTopY, pillR);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Username text
    ctx.save();
    ctx.globalAlpha  = 1;
    ctx.font         = `bold ${fontSize}px Arial`;
    ctx.fillStyle    = '#ffffff';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur   = 6;
    ctx.fillText(label, cx, pillMidY);
    ctx.restore();
  }

  drawNamePill(leftCX,  challName);
  drawNamePill(rightCX, oppName);

  return canvas.toBuffer('image/png');
}

// ─── BATTLE EMBED ─────────────────────────────────────────────────────────────
function buildBattleEmbed(state, imageAttached = false) {
  const { challName, oppName, challenger, opponent, points, endTime } = state;
  const remaining = Math.max(0, endTime - Date.now());
  const cp    = points[challenger.id];
  const op    = points[opponent.id];
  const total = cp + op;
  const filled = total === 0 ? 5 : Math.round((cp / total) * 10);
  const bar   = '🟥'.repeat(filled) + '🟦'.repeat(10 - filled);

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('⚔️  CLOUT 1v1 IN PROGRESS')
    .addFields(
      { name: `🔴 ${challName}`, value: `**${cp} pts**`, inline: true },
      { name: '',                 value: bar,             inline: true },
      { name: `🔵 ${oppName}`,   value: `**${op} pts**`, inline: true },
    )
    .setFooter({ text: `⏱️ ${formatTime(remaining)} left  •  !point @user <amount> <animal>` });

  if (imageAttached) embed.setImage('attachment://battle.png');
  return embed;
}

function formatTime(ms) {
  const s   = Math.ceil(ms / 1000);
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
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
  try { imageBuffer = await buildBattleImage(challenger, opponent, channel.guild); } catch { /* skip */ }
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
  const cp = points[challenger.id];
  const op = points[opponent.id];

  if (cp === op) {
    db.prepare('UPDATE profiles SET losses = losses + 1 WHERE user_id = ?').run(challenger.id);
    db.prepare('UPDATE profiles SET losses = losses + 1 WHERE user_id = ?').run(opponent.id);
    return channel.send({
      embeds: [
        new EmbedBuilder().setColor(0x95a5a6)
          .setTitle('💀 Both fighters failed to impress the crowd!')
          .setDescription(`**${challName}** — ${cp} pts\n**${oppName}** — ${op} pts\n\nTied. Both get **+1 loss**.`),
      ],
    });
  }

  const isChallWinner = cp > op;
  const [winner, loser, winPts, losePts, winName, loseName] = isChallWinner
    ? [challenger, opponent, cp, op, challName, oppName]
    : [opponent, challenger, op, cp, oppName, challName];

  db.prepare('UPDATE profiles SET wins   = wins   + 1 WHERE user_id = ?').run(winner.id);
  db.prepare('UPDATE profiles SET losses = losses + 1 WHERE user_id = ?').run(loser.id);

  return channel.send({
    embeds: [
      new EmbedBuilder().setColor(0xf1c40f).setTitle('🏆 Battle Over!')
        .setDescription(`**${winName}** wins with **${winPts} pts**!\n${loseName} scored ${losePts} pts.`)
        .setThumbnail(winner.displayAvatarURL()),
    ],
  });
}

// ─── BUTTON HANDLER ───────────────────────────────────────────────────────────
async function handleButtonInteraction(interaction) {
  const { customId, user, channel, guild } = interaction;
  if (!customId.startsWith('1v1_accept_') && !customId.startsWith('1v1_deny_')) return;

  const parts   = customId.split('_');
  const action  = parts[1];
  const challId = parts[2];
  const oppId   = parts[3];

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
const aliases = ['point'];

async function execute(client, message, args) {
  const trigger = message.content.slice(client.getPrefix(message.guild?.id).length).trim().split(/\s+/)[0].toLowerCase();

  if (trigger === 'point') return handlePoint(message, args);

  const sub = args[0]?.toLowerCase();
  if (sub === 'help')                         return handleHelp(message);
  if (sub === 'pack')                         return handlePack(message, args);
  if (sub === 'inventory' || sub === 'inv')   return handleInventory(message);
  if (sub === 'profile')                      return handleProfile(message, args);
  if (sub === 'leaderboard' || sub === 'lb')  return handleLeaderboard(message);
  if (sub === 'reset')                        return handleReset(message, args);

  const target =
    message.mentions.users.first() ||
    (args[0] ? await message.guild.members.fetch(args[0]).then(m => m?.user).catch(() => null) : null);

  if (target) return handleChallenge(message, target);
}

// ─── HELP ─────────────────────────────────────────────────────────────────────
async function handleHelp(message) {
  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0xe74c3c).setTitle('⚔️  Clout 1v1 — Help')
        .setDescription('Two players fight for 3 minutes while the chat sends them animals as points.')
        .addFields(
          { name: '🥊 Fighting', value: '`!1v1 @user` — Challenge someone (60s to accept)\n`!point @user <amount> <animal>` — Gift points (15s cooldown)' },
          { name: '📦 Packs', value: '`!1v1 pack` — Open 1 pack (1 animal, up to 5 per 24h)\n`!1v1 pack 3` — Open 3 packs at once\n`!1v1 inventory` — See your animals' },
          { name: '📊 Stats', value: '`!1v1 profile` — Your W/L record\n`!1v1 profile @user` — View profile\n`!1v1 leaderboard` — Top fighters & gifters\n`!1v1 reset` — Reset your own W/L' },
          { name: '🐾 Rarities', value: '🩶 Common · 💚 Uncommon · 💙 Rare · 💜 Epic · 💛 Legendary · ❤️ Mythic · 🤍 Divine' },
          { name: '🎁 Starter Kit', value: '10× Mouse, 5× Turtle, 1× Tiger' },
        )
        .setFooter({ text: 'Example: !point @Astrix 2 Dragon  →  gifts 2 Dragons (200 pts) to Astrix' }),
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
async function handlePoint(message, args) {
  const { author, channel } = message;

  // Only check the battle in THIS channel — no cross-channel interference
  const battle = activeBattles.get(channel.id);
  if (!battle) return message.reply('No active battle in this channel right now.');

  if (author.id === battle.challenger.id || author.id === battle.opponent.id)
    return message.reply("You're in the battle! You can't send points.");

  const target = message.mentions.users.first();
  if (!target) return message.reply('Mention a battler. Usage: `!point @user <amount> <animal>`');

  if (target.id !== battle.challenger.id && target.id !== battle.opponent.id)
    return message.reply("That person isn't in the current battle.");

  const amount = parseInt(args[1]);
  if (!amount || amount < 1) return message.reply('Specify a valid amount. `!point @user <amount> <animal>`');

  const animalName = args.slice(2).join(' ').trim();
  if (!animalName) return message.reply('Specify an animal. `!point @user <amount> <animal>`');

  const animal = ANIMAL_MAP[animalName.toLowerCase()];
  if (!animal) return message.reply(`Unknown animal **${animalName}**. Check \`!1v1 inventory\` for your animals.`);

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

  const currentPts = battle.points[target.id];
  const gifterName = await getDisplayName(channel.guild, author);
  const targetName = target.id === battle.challenger.id ? battle.challName : battle.oppName;

  return channel.send({
    embeds: [
      new EmbedBuilder().setColor(RARITY_COLORS[animal.rarity] ?? 0x2ecc71)
        .setDescription(
          `${animal.emoji} **${gifterName}** gifted **${targetName}** ` +
          `${amount}× **${animal.name}** *(${totalPts} pts)*\n` +
          `${targetName}'s current points: **${currentPts}**`
        ),
    ],
  });
}

// ─── PACK ─────────────────────────────────────────────────────────────────────
async function handlePack(message, args) {
  const { author } = message;
  ensureProfile(author.id);

  const CD_MS     = 24 * 60 * 60 * 1000;
  const MAX_PACKS = 5;
  const now       = Date.now();

  let cdRow = db.prepare('SELECT * FROM pack_cooldowns WHERE user_id = ?').get(author.id);

  if (!cdRow || (now - cdRow.window_start) >= CD_MS) {
    db.prepare(`
      INSERT INTO pack_cooldowns (user_id, window_start, packs_used) VALUES (?, ?, 0)
      ON CONFLICT(user_id) DO UPDATE SET window_start = excluded.window_start, packs_used = 0
    `).run(author.id, now);
    cdRow = { window_start: now, packs_used: 0 };
  }

  const packsLeft = MAX_PACKS - cdRow.packs_used;

  if (packsLeft <= 0) {
    const left = CD_MS - (now - cdRow.window_start);
    const h = Math.floor(left / 3_600_000);
    const m = Math.floor((left % 3_600_000) / 60_000);
    return message.reply(`⏳ You've used all **5 packs** for today. Resets in **${h}h ${m}m**.`);
  }

  const rawAmount = parseInt(args[1]);
  if (args[1] && (isNaN(rawAmount) || rawAmount < 1))
    return message.reply(`❌ Specify a number between 1 and ${packsLeft}. Usage: \`!1v1 pack [1-5]\``);

  const packCount    = (!rawAmount || rawAmount < 1) ? 1 : Math.min(rawAmount, packsLeft);
  const pulled       = Array.from({ length: packCount }, pullRandomAnimal);
  for (const a of pulled) upsertInventory.run(author.id, a.name, 1);

  const newPacksUsed = cdRow.packs_used + packCount;
  db.prepare('UPDATE pack_cooldowns SET packs_used = ? WHERE user_id = ?').run(newPacksUsed, author.id);

  const remaining = MAX_PACKS - newPacksUsed;
  const lines     = pulled.map((a, i) =>
    `**Pack ${cdRow.packs_used + i + 1}:** ${a.emoji} **${a.name}** — ${a.pts} pts \`${a.rarity}\``
  ).join('\n');

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0x9b59b6)
        .setTitle(`📦 Opened ${packCount} Pack${packCount > 1 ? 's' : ''}!`)
        .setDescription(`You got:\n\n${lines}`)
        .setFooter({ text: remaining > 0 ? `${remaining} pack${remaining > 1 ? 's' : ''} remaining today` : 'All 5 packs used! Resets in 24h' }),
    ],
  });
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
async function handleInventory(message) {
  const { author, guild } = message;
  ensureProfile(author.id);

  const inv = getInventory(author.id);
  if (!inv.length) return message.reply('Your inventory is empty! Use `!1v1 pack` to get animals.');

  const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Divine'];
  const grouped = {};
  for (const row of inv) {
    const a = ANIMAL_MAP[row.animal.toLowerCase()];
    if (!a) continue;
    if (!grouped[a.rarity]) grouped[a.rarity] = [];
    grouped[a.rarity].push(`${a.emoji} **${row.animal}** ×${row.amount} *(${a.pts} pts each)*`);
  }

  const fields      = rarityOrder.filter(r => grouped[r]).map(r => ({ name: r, value: grouped[r].join('\n'), inline: false }));
  const displayName = await getDisplayName(guild, author);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0x3498db).setTitle(`🎒 ${displayName}'s Inventory`)
        .addFields(fields).setThumbnail(author.displayAvatarURL()),
    ],
  });
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
async function handleProfile(message, args) {
  const { author, mentions, guild } = message;

  let target = mentions.users.first();
  if (!target && args[1]) target = await guild.members.fetch(args[1]).then(m => m?.user).catch(() => null);
  target = target || author;

  ensureProfile(target.id);
  const p           = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(target.id);
  const total       = p.wins + p.losses;
  const wr          = total > 0 ? ((p.wins / total) * 100).toFixed(1) : '0.0';
  const displayName = await getDisplayName(guild, target);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0xe67e22).setTitle(`⚔️  ${displayName}'s Profile`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
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
  const { author, mentions, guild } = message;

  let target = mentions.users.first();
  const rawId = args[1]?.replace(/\D/g, '');
  if (!target && rawId) target = await guild.members.fetch(rawId).then(m => m?.user).catch(() => null);

  const isSelf = !target || target.id === author.id;

  if (!isSelf) {
    const member = await guild.members.fetch(author.id).catch(() => null);
    if (!member?.permissions.has('ManageGuild'))
      return message.reply('❌ You need **Manage Server** permission to reset someone else\'s record.');
  }

  const resetTarget = isSelf ? author : target;
  ensureProfile(resetTarget.id);
  db.prepare('UPDATE profiles SET wins = 0, losses = 0 WHERE user_id = ?').run(resetTarget.id);

  const displayName = await getDisplayName(guild, resetTarget);

  return message.reply({
    embeds: [
      new EmbedBuilder().setColor(0xe74c3c).setTitle('🔄 Record Reset')
        .setDescription(`**${displayName}**'s wins and losses have been reset to **0**.`)
        .setThumbnail(resetTarget.displayAvatarURL()),
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
      const name   = member?.displayName ?? 'Unknown';
      lines.push(`${medals[i] ?? `${i + 1}.`} ${name} — ${valueFn(rows[i])}`);
    }
    return lines.join('\n') || 'No data yet.';
  }

  const topWins = db.prepare('SELECT user_id, wins, losses FROM profiles ORDER BY wins DESC LIMIT 10').all();
  const topGift = db.prepare('SELECT user_id, points_gifted FROM profiles ORDER BY points_gifted DESC LIMIT 10').all();
  const [winsText, giftText] = await Promise.all([
    formatRows(topWins, r => `${r.wins}W / ${r.losses}L`),
    formatRows(topGift, r => `${r.points_gifted} pts gifted`),
  ]);

  return message.channel.send({
    embeds: [
      new EmbedBuilder().setColor(0xf1c40f).setTitle('🏆 1v1 Leaderboard')
        .addFields(
          { name: '🥊 Top Fighters', value: winsText, inline: false },
          { name: '🎁 Top Gifters',  value: giftText, inline: false },
        ),
    ],
  });
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = { name, aliases, execute, handleButtonInteraction };
