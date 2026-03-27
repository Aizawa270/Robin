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

// ─── GLOBAL STATE (HARDENED) ────────────────────────────────────────────────
const activeBattles = new Map(); // channelId -> battle state
const activeUsers = new Map();    // userId -> channelId
const challenges = new Map();     // "challenger_target" -> { msg, timeout }

// ─── DATABASE ───────────────────────────────────────────────────────────────
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
  user_id      TEXT PRIMARY KEY,
  window_start INTEGER DEFAULT 0,
  packs_used   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS point_cooldowns (
  user_id    TEXT PRIMARY KEY,
  last_point INTEGER DEFAULT 0
);
`);

console.log('[1v1] Database initialized');

// ─── ANIMALS ───────────────────────────────────────────────────────────────

const ANIMALS = [
  { name: 'Mouse', pts: 1, rarity: 'Common', emoji: '🐭', weight: 100 },
  { name: 'Rabbit', pts: 2, rarity: 'Common', emoji: '🐰', weight: 95 },
  { name: 'Fox', pts: 3, rarity: 'Common', emoji: '🦊', weight: 90 },
  { name: 'Turtle', pts: 5, rarity: 'Common', emoji: '🐢', weight: 85 },

  { name: 'Wolf', pts: 7, rarity: 'Uncommon', emoji: '🐺', weight: 75 },
  { name: 'Eagle', pts: 8, rarity: 'Uncommon', emoji: '🦅', weight: 70 },
  { name: 'Tiger', pts: 10, rarity: 'Uncommon', emoji: '🐯', weight: 65 },
  { name: 'Bear', pts: 15, rarity: 'Uncommon', emoji: '🐻', weight: 60 },

  { name: 'Lion', pts: 20, rarity: 'Rare', emoji: '🦁', weight: 50 },
  { name: 'Gorilla', pts: 25, rarity: 'Rare', emoji: '🦍', weight: 45 },
  { name: 'Crocodile', pts: 30, rarity: 'Rare', emoji: '🐊', weight: 40 },
  { name: 'Elephant', pts: 35, rarity: 'Rare', emoji: '🐘', weight: 35 },
  { name: 'Shark', pts: 40, rarity: 'Rare', emoji: '🦈', weight: 30 },
  { name: 'Rhino', pts: 45, rarity: 'Rare', emoji: '🦏', weight: 25 },

  { name: 'T-Rex', pts: 50, rarity: 'Epic', emoji: '🦖', weight: 20 },
  { name: 'Phoenix', pts: 60, rarity: 'Epic', emoji: '🔥', weight: 15 },
  { name: 'Unicorn', pts: 70, rarity: 'Epic', emoji: '🦄', weight: 12 },
  { name: 'Griffin', pts: 80, rarity: 'Epic', emoji: '🦅', weight: 10 },
  { name: 'Pegasus', pts: 90, rarity: 'Epic', emoji: '🐎', weight: 8 },

  { name: 'Dragon', pts: 100, rarity: 'Legendary', emoji: '🐉', weight: 5 },
  { name: 'Hydra', pts: 120, rarity: 'Legendary', emoji: '🐍', weight: 4 },
  { name: 'Kraken', pts: 140, rarity: 'Legendary', emoji: '🐙', weight: 3 },
  { name: 'Cerberus', pts: 160, rarity: 'Mythic', emoji: '🐕', weight: 2 },
];

const ANIMAL_MAP = Object.fromEntries(ANIMALS.map(a => [a.name.toLowerCase(), a]));
const TOTAL_WEIGHT = ANIMALS.reduce((s, a) => s + a.weight, 0);

function pullRandomAnimal() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const a of ANIMALS) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return ANIMALS[0];
}

// ─── HELPERS ───────────────────────────────────────────────────────────────
function ensureProfile(userId) {
  const exists = db.prepare('SELECT 1 FROM profiles WHERE user_id = ?').get(userId);
  if (!exists) {
    db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(userId);
  }
}

function removeFromInventory(userId, animal, amount) {
  const row = db.prepare('SELECT amount FROM inventory WHERE user_id = ? AND animal = ?')
    .get(userId, animal);

  if (!row || row.amount < amount) return false;

  db.prepare('UPDATE inventory SET amount = amount - ? WHERE user_id = ? AND animal = ?')
    .run(amount, userId, animal);

  return true;
}

function addToInventory(userId, animal, amount) {
  db.prepare(`
    INSERT INTO inventory (user_id, animal, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, animal)
    DO UPDATE SET amount = amount + excluded.amount
  `).run(userId, animal, amount);
}

// ─── CHALLENGE SYSTEM (HARDENED) ───────────────────────────────────────────
function getChallengeKey(a, b) {
  return `${a}_${b}`;
}

// ─── TEMPLATE ──────────────────────────────────────────────────────────────
const TEMPLATE_URL = 'https://i.imgur.com/8PTD0Bz.png';

// ─── BATTLE ENGINE ─────────────────────────────────────────────────────────
async function startBattle(channel, challenger, opponent) {
  const battle = {
    challenger,
    opponent,
    points: {
      [challenger.id]: 0,
      [opponent.id]: 0,
    },
    endTime: Date.now() + 3 * 60 * 1000,
  };

  activeBattles.set(channel.id, battle);
  activeUsers.set(challenger.id, channel.id);
  activeUsers.set(opponent.id, channel.id);

  const msg = await channel.send({
    embeds: [buildBattleEmbed(battle)],
  });

  battle.message = msg;

  const interval = setInterval(async () => {
    if (!activeBattles.has(channel.id)) return clearInterval(interval);

    if (Date.now() >= battle.endTime) {
      clearInterval(interval);
      activeBattles.delete(channel.id);

      activeUsers.delete(challenger.id);
      activeUsers.delete(opponent.id);

      return endBattle(channel, battle);
    }

    await msg.edit({ embeds: [buildBattleEmbed(battle)] }).catch(() => {});
  }, 15000);
}

// ─── END BATTLE ────────────────────────────────────────────────────────────
async function endBattle(channel, battle) {
  const cp = battle.points[battle.challenger.id];
  const op = battle.points[battle.opponent.id];

  let winner, loser;

  if (cp === op) {
    db.prepare('UPDATE profiles SET losses = losses + 1 WHERE user_id = ?').run(battle.challenger.id);
    db.prepare('UPDATE profiles SET losses = losses + 1 WHERE user_id = ?').run(battle.opponent.id);

    return channel.send('Tie. Both lose.');
  }

  if (cp > op) {
    winner = battle.challenger;
    loser = battle.opponent;
  } else {
    winner = battle.opponent;
    loser = battle.challenger;
  }

  db.prepare('UPDATE profiles SET wins = wins + 1 WHERE user_id = ?').run(winner.id);
  db.prepare('UPDATE profiles SET losses = losses + 1 WHERE user_id = ?').run(loser.id);

  return channel.send(`🏆 Winner: <@${winner.id}>`);
}

// ─── EMBED ────────────────────────────────────────────────────────────────
function buildBattleEmbed(battle) {
  const cp = battle.points[battle.challenger.id];
  const op = battle.points[battle.opponent.id];

  return new EmbedBuilder()
    .setTitle('⚔️ Battle')
    .setDescription(`<@${battle.challenger.id}> vs <@${battle.opponent.id}>\n\n${cp} vs ${op}`);
}

// ─── POINT COMMAND ────────────────────────────────────────────────────────
async function handlePoint(message, args) {
  const battle = activeBattles.get(message.channel.id);
  if (!battle) return message.reply('No active battle.');

  const target = message.mentions.users.first();
  if (!target) return message.reply('Mention a target.');

  const amount = parseInt(args[1]);
  const animalName = args.slice(2).join(' ').toLowerCase();

  const animal = ANIMAL_MAP[animalName];
  if (!animal) return message.reply('Invalid animal.');

  if (!removeFromInventory(message.author.id, animal.name, amount)) {
    return message.reply('Not enough inventory.');
  }

  const pts = amount * animal.pts;
  battle.points[target.id] += pts;

  return message.channel.send(`${message.author.username} gave ${pts} pts to ${target.username}`);
}

// ─── EXPORT COMMAND ───────────────────────────────────────────────────────
module.exports = {
  name: '1v1',

  async execute(client, message, args) {
    const sub = args[0];

    if (message.content.startsWith('!point')) {
      return handlePoint(message, args);
    }

    if (sub === 'pack') {
      const animal = pullRandomAnimal();
      addToInventory(message.author.id, animal.name, 1);
      return message.reply(`You got ${animal.emoji} ${animal.name}`);
    }

    if (sub === 'challenge') {
      const target = message.mentions.users.first();
      if (!target) return message.reply('Mention someone');

      if (activeUsers.has(message.author.id) || activeUsers.has(target.id)) {
        return message.reply('One of you is already in a battle');
      }

      const key = getChallengeKey(message.author.id, target.id);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_${key}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`deny_${key}`)
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger)
      );

      const msg = await message.channel.send({
        content: `<@${target.id}>`,
        components: [row]
      });

      const timeout = setTimeout(() => {
        challenges.delete(key);
        msg.edit({ components: [] }).catch(() => {});
      }, 60000);

      challenges.set(key, { challenger: message.author, target, channel: message.channel, timeout });

      return;
    }
  },

  async handleButtonInteraction(interaction) {
    const [action, key] = interaction.customId.split('_');
    const challenge = challenges.get(key);
    if (!challenge) return interaction.reply({ content: 'Expired', ephemeral: true });

    if (interaction.user.id !== challenge.target.id) {
      return interaction.reply({ content: 'Not for you', ephemeral: true });
    }

    clearTimeout(challenge.timeout);
    challenges.delete(key);

    if (action === 'deny') {
      return interaction.update({ content: 'Denied', components: [] });
    }

    await interaction.update({ content: 'Accepted!', components: [] });

    startBattle(challenge.channel, challenge.challenger, challenge.target);
  }
};