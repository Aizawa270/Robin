const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const QUARANTINE_FILE = path.join(__dirname, '../../quarantine.json');
const QUARANTINE_ROLE_ID = '1432363678430396436'; // your role ID

function saveData(data) {
  fs.writeFileSync(QUARANTINE_FILE, JSON.stringify(data, null, 2));
}

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

    // Save to quarantine.json
    const data = JSON.parse(fs.readFileSync(QUARANTINE_FILE, 'utf8'));
    data[member.id] = oldRoles;
    saveData(data);

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