const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// ===== DATA / DB =====
const DATA_DIR = path.resolve('./data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));

const QUARANTINE_ROLE_ID = '1432363678430396436'; // quarantine role

// Ensure table exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS quarantine (
    user_id TEXT PRIMARY KEY,
    roles TEXT NOT NULL
  )
`).run();

module.exports = {
  name: 'quarantine',
  aliases: ['q'],
  description: 'Send a user to quarantine.',
  category: 'mod',
  usage: '$quarantine <@user|id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Only administrators can use this command.');
    }

    const targetUser =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null));

    if (!targetUser) {
      return message.reply('Please provide a user mention or ID.');
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not found in this server.');

    // Already quarantined check (role OR DB — avoids desync)
    const dbRow = db
      .prepare('SELECT 1 FROM quarantine WHERE user_id = ?')
      .get(member.id);

    if (member.roles.cache.has(QUARANTINE_ROLE_ID) || dbRow) {
      return message.reply('This user is already in quarantine.');
    }

    // ===== SAVE ROLES (ONLY NON-MANAGED) =====
    const rolesToSave = member.roles.cache
      .filter(r => r.id !== message.guild.id && !r.managed)
      .map(r => r.id);

    db.prepare(
      'INSERT INTO quarantine (user_id, roles) VALUES (?, ?)'
    ).run(member.id, JSON.stringify(rolesToSave));

    try {
      // Keep managed roles (booster, integrations)
      const managedRoles = member.roles.cache
        .filter(r => r.managed)
        .map(r => r.id);

      await member.roles.set([QUARANTINE_ROLE_ID, ...managedRoles]);
    } catch (err) {
      console.error(err);

      // Roll back DB if role set fails
      db.prepare('DELETE FROM quarantine WHERE user_id = ?').run(member.id);

      return message.reply('Failed to set quarantine role. Check bot permissions.');
    }

    const embed = new EmbedBuilder()
      .setColor('#f87171')
      .setTitle('Quarantine Activated')
      .setDescription(`**${targetUser.tag}** has been successfully sent to the zoo.`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};