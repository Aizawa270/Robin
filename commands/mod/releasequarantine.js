const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, './data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'quarantine.sqlite'));
const QUARANTINE_ROLE_ID = '1432363678430396436';

module.exports = {
  name: 'releasequarantine',
  aliases: ['rq'],
  description: 'Release a user from quarantine.',
  category: 'mod',
  usage: '$releasequarantine <@user|id>',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Only administrators can use this command.');
    }

    const targetUser = message.mentions.users.first() || (args[0] && await client.users.fetch(args[0]).catch(() => null));
    if (!targetUser) return message.reply('Please provide a user mention or ID.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not found in this server.');

    const row = db.prepare('SELECT roles FROM quarantine WHERE user_id = ?').get(member.id);
    if (!row) return message.reply('This user is not in quarantine.');

    const oldRoles = JSON.parse(row.roles).filter(id => message.guild.roles.cache.has(id));

    try {
      // Remove quarantine role first
      await member.roles.remove(QUARANTINE_ROLE_ID).catch(() => {});
      // Restore old roles
      await member.roles.set(oldRoles);
    } catch (err) {
      console.error(err);
      return message.reply('Failed to restore roles. Check bot permissions.');
    }

    // Remove from DB
    db.prepare('DELETE FROM quarantine WHERE user_id = ?').run(member.id);

    const embed = new EmbedBuilder()
      .setColor('#34d399')
      .setTitle('Quarantine Released')
      .setDescription(`**${targetUser.tag}** has been released from the zoo.`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};