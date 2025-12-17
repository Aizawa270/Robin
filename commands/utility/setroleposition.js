const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'setroleposition',
  description: 'Move a role to a different position. Usage: $setroleposition @role <position>',
  aliases: ['srp'],
  category: 'utility',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has('ManageRoles')) return message.reply('You need Manage Roles permission.');

    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    const pos = parseInt(args[1]);
    if (!role || isNaN(pos)) return message.reply('Usage: $setroleposition @role <position>');

    if (role.position >= message.guild.members.me.roles.highest.position)
      return message.reply("I cannot move this role because it's above my top role.");

    try {
      await role.setPosition(pos);
      const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('Role Position Changed')
        .setDescription(`Moved **${role.name}** to position **${pos}**`)
        .setThumbnail(message.guild.iconURL({ dynamic: true }));
      message.reply({ embeds: [embed] });
    } catch (e) {
      console.error(e);
      message.reply('Something went wrong while executing that command.');
    }
  },
};