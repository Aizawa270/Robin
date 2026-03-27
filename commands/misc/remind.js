// commands/misc/remind.js
// !remind <time> <message>  — DMs you after the timer
// !remind list              — shows your active reminders
// !remind cancel <id>       — cancels a reminder

const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ─── DATABASE ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'reminders.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    fire_at    INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    done       INTEGER DEFAULT 0
  );
`);

// In-memory map of active timeouts: reminderId → TimeoutHandle
const activeTimeouts = new Map();

// ─── PARSE TIME STRING ───────────────────────────────────────────────────────
// Supports: 10s, 5m, 2h, 1d, or combos like 1h30m
function parseTime(str) {
  const regex = /(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)/gi;
  let totalMs = 0;
  let match;
  while ((match = regex.exec(str)) !== null) {
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if      (unit.startsWith('s')) totalMs += val * 1_000;
    else if (unit.startsWith('m')) totalMs += val * 60_000;
    else if (unit.startsWith('h')) totalMs += val * 3_600_000;
    else if (unit.startsWith('d')) totalMs += val * 86_400_000;
  }
  return totalMs > 0 ? totalMs : null;
}

// ─── FORMAT MS → READABLE ────────────────────────────────────────────────────
function formatDuration(ms) {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return [
    d ? `${d}d` : '',
    h ? `${h}h` : '',
    m ? `${m}m` : '',
    s ? `${s}s` : '',
  ].filter(Boolean).join(' ') || '0s';
}

// ─── FIRE REMINDER ───────────────────────────────────────────────────────────
async function fireReminder(client, reminderId) {
  const row = db.prepare('SELECT * FROM reminders WHERE id = ? AND done = 0').get(reminderId);
  if (!row) return;

  db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(reminderId);
  activeTimeouts.delete(reminderId);

  let user;
  try { user = await client.users.fetch(row.user_id); } catch { return; }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('⏰ Reminder!')
    .setDescription(`> ${row.message}`)
    .setFooter({ text: `Reminder #${row.id}` })
    .setTimestamp();

  try {
    await user.send({ embeds: [embed] });
  } catch {
    // DMs closed — silently fail
  }
}

// ─── SCHEDULE REMINDER ───────────────────────────────────────────────────────
function scheduleReminder(client, row) {
  const delay = Math.max(0, row.fire_at - Date.now());
  const handle = setTimeout(() => fireReminder(client, row.id), delay);
  activeTimeouts.set(row.id, handle);
}

// ─── RESTORE ON STARTUP ──────────────────────────────────────────────────────
// Call this from your main index.js once the client is ready:
//   require('./commands/misc/remind').restoreReminders(client)
function restoreReminders(client) {
  const pending = db.prepare('SELECT * FROM reminders WHERE done = 0').all();
  for (const row of pending) {
    if (row.fire_at <= Date.now()) {
      // Overdue — fire immediately
      fireReminder(client, row.id);
    } else {
      scheduleReminder(client, row);
    }
  }
  console.log(`[remind] Restored ${pending.length} pending reminder(s)`);
}

// ─── HANDLERS ────────────────────────────────────────────────────────────────
async function handleSet(client, message, args) {
  // args[0] = time string, args[1]+ = reminder message
  const timeStr = args[0];
  const reminderText = args.slice(1).join(' ').trim();

  if (!timeStr || !reminderText) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Invalid Usage')
          .setDescription(
            '`!remind <time> <message>`\n\n' +
            '**Examples:**\n' +
            '`!remind 10m Do homework`\n' +
            '`!remind 1h30m Check oven`\n' +
            '`!remind 2h Meeting with team`'
          ),
      ],
    });
  }

  const ms = parseTime(timeStr);
  if (!ms) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Invalid Time')
          .setDescription(
            'Couldn\'t parse that time. Use formats like:\n' +
            '`30s` · `10m` · `2h` · `1d` · `1h30m`'
          ),
      ],
    });
  }

  if (ms > 30 * 24 * 3_600_000) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Too Far Ahead')
          .setDescription('Max reminder time is **30 days**.'),
      ],
    });
  }

  const fireAt = Date.now() + ms;
  const result = db.prepare(
    'INSERT INTO reminders (user_id, message, fire_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(message.author.id, reminderText, fireAt, Date.now());

  const reminderId = result.lastInsertRowid;
  const row = db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
  scheduleReminder(client, row);

  // Confirm in channel
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('✅ Reminder Set!')
        .setDescription(`> ${reminderText}`)
        .addFields(
          { name: '⏱️ In',    value: formatDuration(ms),                       inline: true },
          { name: '🕐 At',    value: `<t:${Math.floor(fireAt / 1000)}:T>`,     inline: true },
          { name: '🆔 ID',    value: `#${reminderId}`,                          inline: true },
        )
        .setFooter({ text: 'I\'ll DM you when it\'s time!' }),
    ],
  });
}

async function handleList(message) {
  const rows = db.prepare(
    'SELECT * FROM reminders WHERE user_id = ? AND done = 0 ORDER BY fire_at ASC'
  ).all(message.author.id);

  if (!rows.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('📋 Your Reminders')
          .setDescription('You have no active reminders.\nSet one with `!remind <time> <message>`'),
      ],
    });
  }

  const lines = rows.map(r => {
    const timeLeft = formatDuration(Math.max(0, r.fire_at - Date.now()));
    const short = r.message.length > 50 ? r.message.slice(0, 49) + '…' : r.message;
    return `**#${r.id}** — \`${timeLeft}\` left\n> ${short}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📋 Your Reminders (${rows.length})`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Cancel one with: !remind cancel <id>' });

  return message.reply({ embeds: [embed] });
}

async function handleCancel(message, args) {
  const id = parseInt(args[1]);
  if (!id || isNaN(id)) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Invalid Usage')
          .setDescription('`!remind cancel <id>`\n\nGet your reminder IDs with `!remind list`'),
      ],
    });
  }

  const row = db.prepare(
    'SELECT * FROM reminders WHERE id = ? AND user_id = ? AND done = 0'
  ).get(id, message.author.id);

  if (!row) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('❌ Not Found')
          .setDescription(`No active reminder **#${id}** found for you.`),
      ],
    });
  }

  // Cancel the timeout and mark done
  const handle = activeTimeouts.get(id);
  if (handle) {
    clearTimeout(handle);
    activeTimeouts.delete(id);
  }
  db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(id);

  const short = row.message.length > 60 ? row.message.slice(0, 59) + '…' : row.message;

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('🗑️ Reminder Cancelled')
        .setDescription(`> ${short}`)
        .setFooter({ text: `Reminder #${id} deleted` }),
    ],
  });
}

// ─── COMMAND ROUTER ──────────────────────────────────────────────────────────
const name    = 'remind';
const aliases = ['reminder', 'remindme'];

async function execute(client, message, args) {
  const sub = args[0]?.toLowerCase();

  if (sub === 'list')   return handleList(message);
  if (sub === 'cancel') return handleCancel(message, args);

  // Default: set a reminder
  return handleSet(client, message, args);
}

module.exports = { name, aliases, execute, restoreReminders };