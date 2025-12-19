const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, './data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
const QUARANTINE_ROLE_ID = '1432363678430396436';

db.prepare(`
  CREATE TABLE IF NOT EXISTS quarantine (
    user_id TEXT PRIMARY KEY,
    roles TEXT
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

    const targetUser = message.mentions.users.first() || (args[0] && await client.users.fetch(args[0]).catch(() => null));
    if (!targetUser) return message.reply('Please provide a user mention or ID.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not found in this server.');
    if (member.roles.cache.has(QUARANTINE_ROLE_ID)) {
      return message.reply('This user is already in quarantine.');
    }

    // Store current roles except @everyone
    const oldRoles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.id);
    db.prepare('INSERT OR REPLACE INTO quarantine (user_id, roles) VALUES (?, ?)').run(member.id, JSON.stringify(oldRoles));

    try {
      // Set quarantine role only
      await member.roles.set([QUARANTINE_ROLE_ID]);
    } catch (err) {
      console.error(err);
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