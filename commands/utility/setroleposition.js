const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'setroleposition',
  description: 'Move a role to a different position (1 = highest role). Usage: $setroleposition @role <position>',
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

    // User wants: 1 = highest role, last number = lowest role
    // Discord uses: highest number = highest role, 0/1 = lowest role
    
    const totalRoles = message.guild.roles.cache.size;
    
    // Validate position
    if (pos < 1) return message.reply(`Position must be between 1 and ${totalRoles}.`);
    if (pos > totalRoles) return message.reply(`Position must be between 1 and ${totalRoles}.`);
    
    // Convert user position to Discord position
    // User position 1 (top) = Discord position (totalRoles - 1)
    // User position totalRoles (bottom) = Discord position 0
    const discordPosition = totalRoles - pos;

    try {
      await role.setPosition(discordPosition);
      
      // ✅ USE message.createEmbed()
      const embed = message.createEmbed({
        title: '✅ Role Position Changed',
        description: `Moved **${role.name}** to position **${pos}**\n(1 = highest role, ${totalRoles} = lowest role)`,
        thumbnail: message.guild.iconURL({ dynamic: true }),
        footer: { text: `Highest role = 1 | Lowest role = ${totalRoles}` }
      });
      
      message.reply({ embeds: [embed] });
    } catch (e) {
      console.error(e);
      message.reply('Something went wrong while executing that command.');
    }
  },
};