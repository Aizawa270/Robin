const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const QUARANTINE_FILE = path.join(__dirname, '../../quarantine.json');
const QUARANTINE_ROLE_ID = '1432363678430396436';

function saveData(data) {
  fs.writeFileSync(QUARANTINE_FILE, JSON.stringify(data, null, 2));
}

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

    const data = JSON.parse(fs.readFileSync(QUARANTINE_FILE, 'utf8'));
    const oldRoles = data[member.id];
    if (!oldRoles) return message.reply('This user is not in quarantine.');

    // Restore old roles and remove quarantine
    await member.roles.set(oldRoles).catch(console.error);

    // Remove from JSON
    delete data[member.id];
    saveData(data);

    const embed = new EmbedBuilder()
      .setColor('#34d399')
      .setTitle('Quarantine Released')
      .setDescription(`**${targetUser.tag}** has been released from the zoo.`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};