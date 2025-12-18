const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
  name: 'setroleicon',
  description: 'Set an icon for a role.',
  category: 'utility',
  usage: '$setroleicon <role> <image url>',
  aliases: ['sri'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) 
      return message.reply('You need Manage Roles permissions.');

    const roleArg = args[0];
    const url = args[1];
    if (!roleArg || !url) return message.reply('Usage: $setroleicon <role> <image URL>');

    const role = message.mentions.roles.first() || message.guild.roles.cache.get(roleArg);
    if (!role) return message.reply('Role not found.');

    try {
      const res = await fetch(url);
      if (!res.ok) return message.reply('Failed to fetch the image.');

      const buffer = Buffer.from(await res.arrayBuffer());
      await role.setIcon(buffer);

      const embed = new EmbedBuilder()
        .setColor(role.hexColor || '#ffffff')
        .setDescription(`Role **${role.name}** icon has been updated successfully.`);
      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('SetRoleIcon error:', err);
      message.reply('Failed to set role icon.');
    }
  },
};