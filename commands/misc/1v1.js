// commands/1v1.js
// Plugs into the existing commandHandler pattern
// DB stored in data/1v1.sqlite — persisted via the GitHub Actions git-commit backup

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
// Same data/ folder your .yml already commits to git every 30 min
const DATA_DIR = path.join(__dirname, '..', 'data');
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
    user_id    TEXT PRIMARY KEY,
    last_claim INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS point_cooldowns (
    user_id    TEXT PRIMARY KEY,
    last_point INTEGER DEFAULT 0
  );
`);

console.log('[1v1] Database initialized');

// ─── ANIMALS + RARITY ────────────────────────────────────────────────────────
// weight = drop chance in packs. Higher pts = lower weight = rarer pull.

const ANIMALS = [
  { name: 'Mouse',      pts: 1,   rarity: 'Common',    emoji: '🐭', weight: 100 },
  { name: 'Rabbit',     pts: 2,   rarity: 'Common',    emoji: '🐰', weight: 90  },
  { name: 'Fox',        pts: 3,   rarity: 'Common',    emoji: '🦊', weight: 80  },
  { name: 'Turtle',     pts: 5,   rarity: 'Common',    emoji: '🐢', weight: 70  },
  { name: 'Wolf',       pts: 7,   rarity: 'Uncommon',  emoji: '🐺', weight: 55  },
  { name: 'Eagle',      pts: 8,   rarity: 'Uncommon',  emoji: '🦅', weight: 50  },
  { name: 'Tiger',      pts: 10,  rarity: 'Uncommon',  emoji: '🐯', weight: 45  },
  { name: 'Bear',       pts: 15,  rarity: 'Uncommon',  emoji: '🐻', weight: 38  },
  { name: 'Lion',       pts: 20,  rarity: 'Rare',      emoji: '🦁', weight: 30  },
  { name: 'Gorilla',    pts: 25,  rarity: 'Rare',      emoji: '🦍', weight: 25  },
  { name: 'Crocodile',  pts: 30,  rarity: 'Rare',      emoji: '🐊', weight: 20  },
  { name: 'Elephant',   pts: 35,  rarity: 'Rare',      emoji: '🐘', weight: 16  },
  { name: 'Shark',      pts: 40,  rarity: 'Epic',      emoji: '🦈', weight: 12  },
  { name: 'Rhino',      pts: 45,  rarity: 'Epic',      emoji: '🦏', weight: 10  },
  { name: 'T-Rex',      pts: 50,  rarity: 'Epic',      emoji: '🦖', weight: 8   },
  { name: 'Phoenix',    pts: 60,  rarity: 'Epic',      emoji: '🔥', weight: 6   },
  { name: 'Unicorn',    pts: 70,  rarity: 'Legendary', emoji: '🦄', weight: 4   },
  { name: 'Griffin',    pts: 80,  rarity: 'Legendary', emoji: '🦅', weight: 3   },
  { name: 'Pegasus',    pts: 90,  rarity: 'Legendary', emoji: '✨', weight: 2   },
  { name: 'Dragon',     pts: 100, rarity: 'Legendary', emoji: '🐉', weight: 1.5 },
  { name: 'Hydra',      pts: 120, rarity: 'Mythic',    emoji: '🐲', weight: 1   },
  { name: 'Kraken',     pts: 140, rarity: 'Mythic',    emoji: '🦑', weight: 0.7 },
  { name: 'Cerberus',   pts: 160, rarity: 'Mythic',    emoji: '👁️',  weight: 0.4 },
];

const RARITY_COLORS = {
  Common:    0x95a5a6,
  Uncommon:  0x2ecc71,
  Rare:      0x3498db,
  Epic:      0x9b59b6,
  Legendary: 0xf1c40f,
  Mythic:    0xe74c3c,
};

const ANIMAL_MAP   = Object.fromEntries(ANIMALS.map(a => [a.name.toLowerCase(), a]));
const TOTAL_WEIGHT = ANIMALS.reduce((s, a) => s + a.weight, 0);

function pullRandomAnimal() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const a of ANIMALS) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return ANIMALS[0];
}

// ─── STARTER KIT ─────────────────────────────────────────────────────────────
const STARTER_KIT = [
  { animal: 'Mouse',  amount: 10 },
  { animal: 'Turtle', amount: 5  },
  { animal: 'Tiger',  amount: 1  },
];

// ─── DB HELPERS ──────────────────────────────────────────────────────────────
function ensureProfile(userId) {
  const exists = db.prepare('SELECT 1 FROM profiles WHERE user_id = ?').get(userId);
  if (!exists) {
    db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(userId);
    for (const { animal, amount } of STARTER_KIT) {
      db.prepare(`
        INSERT INTO inventory (user_id, animal, amount) VALUES (?, ?, ?)
        ON CONFLICT(user_id, animal) DO UPDATE SET amount = amount + excluded.amount
      `).run(userId, animal, amount);
    }
  }
}

const upsertInventory = db.prepare(`
  INSERT INTO inventory (user_id, animal, amount) VALUES (?, ?, ?)
  ON CONFLICT(user_id, animal) DO UPDATE SET amount = amount + excluded.amount
`);

function removeFromInventory(userId, animalName, amount) {
  const row = db.prepare('SELECT amount FROM inventory WHERE user_id = ? AND animal = ?').get(userId, animalName);
  if (!row || row.amount < amount) return false;
  db.prepare('UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND animal = ?').run(amount, userId, animalName);
  return true;
}

function getInventory(userId) {
  return db.prepare('SELECT animal, amount FROM inventory WHERE user_id = ? AND amount > 0').all(userId);
}

// ─── ACTIVE BATTLES (in-memory) ───────────────────────────────────────────────
const activeBattles = new Map();

// ─── CANVAS BATTLE IMAGE ─────────────────────────────────────────────────────
async function buildBattleImage(challenger, opponent) {
  let createCanvas, loadImage;
  try {
    ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
  } catch {
    return null;
  }

  const templatePath = path.join(__dirname, '..', 'assets', '1v1_template.png');
  if (!fs.existsSync(templatePath)) return null;

  const template = await loadImage(templatePath);
  const W = template.width;
  const H = template.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(template, 0, 0, W, H);

  const avatarSize = Math.round(W * 0.18);
  const avatarY    = Math.round(H * 0.22);
  const leftCX     = Math.round(W * 0.22);
  const rightCX    = Math.round(W * 0.78);

  async function drawAvatar(url, cx, cy) {
    try {
      const img = await loadImage(url + '?size=256');
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - avatarSize / 2, cy - avatarSize / 2, avatarSize, avatarSize);
      ctx.restore();
    } catch { /* skip on error */ }
  }

  await drawAvatar(challenger.displayAvatarURL({ extension: 'png' }), leftCX,  avatarY);
  await drawAvatar(opponent.displayAvatarURL({ extension: 'png' }),   rightCX, avatarY);

  const fontSize = Math.round(W * 0.027);
  ctx.font        = `bold ${fontSize}px Arial`;
  ctx.fillStyle   = '#ffffff';
  ctx.textAlign   = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur   = 7;

  const trim = s => s.length > 14 ? s.slice(0, 13) + '…' : s;
  ctx.fillText(trim(challenger.displayName), leftCX,  avatarY - avatarSize / 2 - 8);
  ctx.fillText(trim(opponent.displayName),   rightCX, avatarY - avatarSize / 2 - 8);

  return canvas.toBuffer('image/png');
}

// ─── BATTLE EMBED ─────────────────────────────────────────────────────────────
function buildBattleEmbed(state, imageAttached = false) {
  const { challenger, opponent, points, endTime } = state;
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
      { name: `🔴 ${challenger.displayName}`, value: `**${cp} pts**`, inline: true },
      { name: '​',                             value: bar,             inline: true },
      { name: `🔵 ${opponent.displayName}`,   value: `**${op} pts**`, inline: true },
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

  const state = {
    challenger,
    opponent,
    points:     { [challenger.id]: 0, [opponent.id]: 0 },
    endTime,
    intervalId: null,
    battleMsg:  null,
    hasImage:   false,
  };

  activeBattles.set(channel.id, state);

  let imageBuffer = null;
  try { imageBuffer = await buildBattleImage(challenger, opponent); } catch { /* skip */ }
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
  const { challenger, opponent, points } = state;
  const cp = points[challenger.id];
  const op = points[opponent.id];

  if (cp === op) {
    db.prepare('UPDATE profiles SET losses = losses + 1 WHERE user_id = ?').run(challenger.id);
    db.prepare('UPDATE profiles SET losses = losses + 1 WHERE user_id = ?').run(opponent.id);

    return channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('💀 Both fighters failed to impress the crowd!')
          .setDescription(
            `**${challenger.displayName}** — ${cp} pts\n` +
            `**${opponent.displayName}** — ${op} pts\n\n` +
            `Tied. Both get **+1 loss**.`
          ),
      ],
    });
  }

  const [winner, loser, winPts, losePts] =
    cp > op ? [challenger, opponent, cp, op] : [opponent, challenger, op, cp];

  db.prepare('UPDATE profiles SET wins   = wins   + 1 WHERE user_id = ?').run(winner.id);
  db.prepare('UPDATE profiles SET losses = losses + 1 WHERE user_id = ?').run(loser.id);

  return channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🏆 Battle Over!')
        .setDescription(
          `**${winner.displayName}** wins with **${winPts} pts**!\n` +
          `${loser.displayName} scored ${losePts} pts.`
        )
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

  if (user.id !== oppId) {
    return interaction.reply({ content: 'This challenge is not for you.', ephemeral: true });
  }

  const key     = `${challId}_${oppId}`;
  const pending = channel.client._1v1Challenges?.get(key);
  if (!pending) {
    return interaction.reply({ content: 'Challenge not found or already expired.', ephemeral: true });
  }

  clearTimeout(pending.expireTimeout);
  channel.client._1v1Challenges.delete(key);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('d1').setLabel('✅ Accept').setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId('d2').setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(true),
  );

  if (action === 'deny') {
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('❌ Challenge Denied')
          .setDescription(`**${user.displayName}** said no.`),
      ],
      components: [disabledRow],
    });
  }

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ Challenge Accepted!')
        .setDescription('The battle is starting…'),
    ],
    components: [disabledRow],
  });

  const challenger = await guild.members.fetch(challId).then(m => m.user).catch(() => null);
  if (!challenger) return;

  startBattle(channel, challenger, user);
}

// ─── COMMAND ROUTER ───────────────────────────────────────────────────────────
const name    = '1v1';
const aliases = ['point', '1v1pack'];

async function execute(client, message, args) {
  // Figure out which trigger word was used
  const trigger = message.content.slice(client.getPrefix(message.guild?.id).length).trim().split(/\s+/)[0].toLowerCase();

  if (trigger === '1v1pack') return handlePack(message);
  if (trigger === 'point')   return handlePoint(message, args);

  // !1v1 <subcommand>
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === 'help')                   return handleHelp(message);
  if (sub === 'inventory' || sub === 'inv')     return handleInventory(message);
  if (sub === 'profile')                         return handleProfile(message, args);
  if (sub === 'leaderboard' || sub === 'lb')    return handleLeaderboard(message);

  // !1v1 @user or !1v1 <userId>
  const target =
    message.mentions.users.first() ||
    (args[0] ? await message.guild.members.fetch(args[0]).then(m => m?.user).catch(() => null) : null);

  if (target) return handleChallenge(message, target);

  return handleHelp(message);
}

// ─── HELP ─────────────────────────────────────────────────────────────────────
async function handleHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('⚔️  Clout 1v1 — Help')
    .setDescription('Two players fight for 3 minutes while the chat sends them animals as points.')
    .addFields(
      {
        name: '🥊 Fighting',
        value: [
          '`!1v1 @user` — Challenge someone to a fight *(they have 60s to accept)*',
          '`!point @user <amount> <animal>` — Gift points to a battler *(15s cooldown, battlers cannot point)*',
        ].join('\n'),
      },
      {
        name: '📦 Packs & Inventory',
        value: [
          '`!1v1pack` — Open your daily pack for 5 random animals *(24h cooldown)*',
          '`!1v1 inventory` — See all animals you own',
        ].join('\n'),
      },
      {
        name: '📊 Stats & Leaderboard',
        value: [
          '`!1v1 profile` — Your wins, losses & total points gifted',
          '`!1v1 profile @user` — View someone else\'s profile',
          '`!1v1 leaderboard` — Top fighters + top gifters',
        ].join('\n'),
      },
      {
        name: '🐾 Animal Rarities (pack drop rates)',
        value: [
          '🩶 **Common** — Mouse · Rabbit · Fox · Turtle *(1–5 pts)*',
          '💚 **Uncommon** — Wolf · Eagle · Tiger · Bear *(7–15 pts)*',
          '💙 **Rare** — Lion · Gorilla · Crocodile · Elephant *(20–35 pts)*',
          '💜 **Epic** — Shark · Rhino · T-Rex · Phoenix *(40–60 pts)*',
          '💛 **Legendary** — Unicorn · Griffin · Pegasus · Dragon *(70–100 pts)*',
          '❤️ **Mythic** — Hydra · Kraken · Cerberus *(120–160 pts)* — extremely rare',
        ].join('\n'),
      },
      {
        name: '🎁 Starter Kit',
        value: 'Every new player gets: **10× Mouse**, **5× Turtle**, **1× Tiger**',
      },
      {
        name: '🏆 Win / Lose',
        value: [
          'Most points after 3 min = **Win (+1W)**  |  Other player = **Loss (+1L)**',
          'Tied = both get **+1 Loss** 💀',
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Example: !point @Astrix 2 Dragon  →  gifts 2 Dragons (200 pts) to Astrix' });

  return message.reply({ embeds: [embed] });
}

// ─── CHALLENGE ────────────────────────────────────────────────────────────────
async function handleChallenge(message, target) {
  const { author, channel } = message;

  if (target.id === author.id) return message.reply("You can't fight yourself 💀");
  if (target.bot)              return message.reply("Bots don't fight.");

  if (activeBattles.has(channel.id)) {
    return message.reply('There\'s already an active battle in this channel!');
  }

  for (const [, battle] of activeBattles) {
    if ([battle.challenger.id, battle.opponent.id].includes(author.id)) {
      return message.reply('You\'re already in a battle somewhere else!');
    }
    if ([battle.challenger.id, battle.opponent.id].includes(target.id)) {
      return message.reply(`${target.displayName} is already in a battle!`);
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`1v1_accept_${author.id}_${target.id}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`1v1_deny_${author.id}_${target.id}`)
      .setLabel('❌ Deny')
      .setStyle(ButtonStyle.Danger),
  );

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('⚔️  Fight Challenge!')
    .setDescription(
      `**${author.displayName}** challenged **${target.displayName}** to a Clout 1v1!\n\n` +
      `${target}, do you accept?\n\n*Expires in 60 seconds.*`
    )
    .setThumbnail(author.displayAvatarURL());

  const msg = await channel.send({ content: `${target}`, embeds: [embed], components: [row] });

  const expireTimeout = setTimeout(async () => {
    const expired = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('e1').setLabel('✅ Accept').setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId('e2').setLabel('❌ Deny').setStyle(ButtonStyle.Danger).setDisabled(true),
    );
    await msg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('⏰ Challenge Expired')
          .setDescription(`**${author.displayName}** vs **${target.displayName}** — no response.`),
      ],
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

  const battle = activeBattles.get(channel.id);
  if (!battle) return message.reply('No active battle in this channel right now.');

  if (author.id === battle.challenger.id || author.id === battle.opponent.id) {
    return message.reply("You're in the battle! You can't send points.");
  }

  const target = message.mentions.users.first();
  if (!target) return message.reply('Mention a battler. Usage: `!point @user <amount> <animal>`');

  if (target.id !== battle.challenger.id && target.id !== battle.opponent.id) {
    return message.reply("That person isn't in the current battle.");
  }

  const amount = parseInt(args[1]);
  if (!amount || amount < 1) return message.reply('Specify a valid amount. `!point @user <amount> <animal>`');

  const animalName = args.slice(2).join(' ').trim();
  if (!animalName) return message.reply('Specify an animal. `!point @user <amount> <animal>`');

  const animal = ANIMAL_MAP[animalName.toLowerCase()];
  if (!animal) {
    return message.reply(`Unknown animal **${animalName}**. Check \`!1v1 inventory\` for your animals.`);
  }

  // 15s cooldown
  const cdRow  = db.prepare('SELECT last_point FROM point_cooldowns WHERE user_id = ?').get(author.id);
  const elapsed = Date.now() - (cdRow?.last_point || 0);
  if (elapsed < 15_000) {
    const left = Math.ceil((15_000 - elapsed) / 1000);
    return message.reply(`⏳ Cooldown! Wait **${left}s** before gifting again.`);
  }

  ensureProfile(author.id);

  if (!removeFromInventory(author.id, animal.name, amount)) {
    return message.reply(`You don't have ${amount}× **${animal.name}**. Check \`!1v1 inventory\`.`);
  }

  const totalPts   = amount * animal.pts;
  battle.points[target.id] += totalPts;

  db.prepare('UPDATE profiles SET points_gifted = points_gifted + ? WHERE user_id = ?').run(totalPts, author.id);
  db.prepare('INSERT OR REPLACE INTO point_cooldowns (user_id, last_point) VALUES (?, ?)').run(author.id, Date.now());

  const currentPts = battle.points[target.id];

  const embed = new EmbedBuilder()
    .setColor(RARITY_COLORS[animal.rarity] ?? 0x2ecc71)
    .setDescription(
      `${animal.emoji} **${author.displayName}** gifted **${target.displayName}** ` +
      `${amount}× **${animal.name}** *(${totalPts} pts)*\n` +
      `${target.displayName}'s current points: **${currentPts}**`
    );

  return channel.send({ embeds: [embed] });
}

// ─── PACK ─────────────────────────────────────────────────────────────────────
async function handlePack(message) {
  const { author } = message;
  ensureProfile(author.id);

  const CD_MS  = 24 * 60 * 60 * 1000;
  const cdRow  = db.prepare('SELECT last_claim FROM pack_cooldowns WHERE user_id = ?').get(author.id);
  const elapsed = Date.now() - (cdRow?.last_claim || 0);

  if (elapsed < CD_MS) {
    const left = CD_MS - elapsed;
    const h    = Math.floor(left / 3_600_000);
    const m    = Math.floor((left % 3_600_000) / 60_000);
    return message.reply(`⏳ Pack on cooldown. Come back in **${h}h ${m}m**.`);
  }

  const pulled = Array.from({ length: 5 }, pullRandomAnimal);
  for (const a of pulled) upsertInventory.run(author.id, a.name, 1);
  db.prepare('INSERT OR REPLACE INTO pack_cooldowns (user_id, last_claim) VALUES (?, ?)').run(author.id, Date.now());

  const lines = pulled.map(a =>
    `${a.emoji} **${a.name}** — ${a.pts} pts  \`${a.rarity}\``
  ).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('📦 Pack Opened!')
    .setDescription(`You pulled:\n\n${lines}\n\nNext pack in **24h**.`)
    .setFooter({ text: 'Rarer animals are harder to pull — keep opening daily packs!' });

  return message.reply({ embeds: [embed] });
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
async function handleInventory(message) {
  const { author } = message;
  ensureProfile(author.id);

  const inv = getInventory(author.id);
  if (!inv.length) return message.reply('Your inventory is empty! Use `!1v1pack` to get animals.');

  const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
  const grouped = {};
  for (const row of inv) {
    const a = ANIMAL_MAP[row.animal.toLowerCase()];
    if (!a) continue;
    if (!grouped[a.rarity]) grouped[a.rarity] = [];
    grouped[a.rarity].push(`${a.emoji} **${row.animal}** ×${row.amount} *(${a.pts} pts each)*`);
  }

  const fields = rarityOrder
    .filter(r => grouped[r])
    .map(r => ({ name: r, value: grouped[r].join('\n'), inline: false }));

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`🎒 ${author.displayName}'s Inventory`)
    .addFields(fields)
    .setThumbnail(author.displayAvatarURL());

  return message.reply({ embeds: [embed] });
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
async function handleProfile(message, args) {
  const { author, mentions, guild } = message;

  let target = mentions.users.first();
  if (!target && args[1]) {
    target = await guild.members.fetch(args[1]).then(m => m?.user).catch(() => null);
  }
  target = target || author;

  ensureProfile(target.id);
  const p     = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(target.id);
  const total = p.wins + p.losses;
  const wr    = total > 0 ? ((p.wins / total) * 100).toFixed(1) : '0.0';

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle(`⚔️  ${target.displayName}'s Profile`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: '🏆 Wins',          value: `${p.wins}`,          inline: true },
      { name: '💀 Losses',        value: `${p.losses}`,        inline: true },
      { name: '📊 Win Rate',      value: `${wr}%`,             inline: true },
      { name: '🎁 Points Gifted', value: `${p.points_gifted}`, inline: true },
    );

  return message.reply({ embeds: [embed] });
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
      lines.push(`${medals[i] ?? `**${i + 1}.**`} ${name} — ${valueFn(rows[i])}`);
    }
    return lines.join('\n') || 'No data yet.';
  }

  const topWins = db.prepare('SELECT user_id, wins, losses FROM profiles ORDER BY wins DESC LIMIT 10').all();
  const topGift = db.prepare('SELECT user_id, points_gifted FROM profiles ORDER BY points_gifted DESC LIMIT 10').all();

  const [winsText, giftText] = await Promise.all([
    formatRows(topWins, r => `${r.wins}W / ${r.losses}L`),
    formatRows(topGift, r => `${r.points_gifted} pts gifted`),
  ]);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏆 1v1 Leaderboard')
    .addFields(
      { name: '🥊 Top Fighters', value: winsText, inline: false },
      { name: '🎁 Top Gifters',  value: giftText, inline: false },
    );

  return message.channel.send({ embeds: [embed] });
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  name,
  aliases,
  execute,
  handleButtonInteraction,
};
