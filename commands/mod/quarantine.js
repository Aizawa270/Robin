// quarantine.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const db = new Database('./data/quarantine.sqlite');

const QUARANTINE_ROLE_ID = '1432363678430396436';

// Ensure table exists
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

    // Store current roles
    const oldRoles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.id);
    const rolesStr = JSON.stringify(oldRoles);

    // Insert into DB
    db.prepare('INSERT OR REPLACE INTO quarantine (user_id, roles) VALUES (?, ?)').run(member.id, rolesStr);

    // Remove all roles and add quarantine role
    await member.roles.set([QUARANTINE_ROLE_ID]).catch(console.error);

    // Embed
    const embed = new EmbedBuilder()
      .setColor('#f87171')
      .setTitle('Quarantine Activated')
      .setDescription(`**${targetUser.tag}** has been successfully sent to the zoo.`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};