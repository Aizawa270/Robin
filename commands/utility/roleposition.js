const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'roleposition',
  description: 'Get the position of a role (1 = highest role). Usage: $roleposition @role',
  aliases: ['rp'],
  category: 'utility',
  async execute(client, message, args) {
    if (!message.guild) return;

    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    if (!role) return message.reply('Usage: $roleposition @role');

    const totalRoles = message.guild.roles.cache.size;
    
    // Calculate position where 1 = highest role
    // Discord position 0 (lowest) = totalRoles (user sees as bottom)
    // Discord position (totalRoles-1) (highest) = 1 (user sees as top)
    const userPosition = totalRoles - role.position;

    // ✅ USE message.createEmbed()
    const embed = message.createEmbed({
      title: 'Role Position',
      description: `**${role.name}**`,
      fields: [
        { 
          name: 'Position', 
          value: `**#${userPosition}** of ${totalRoles}\n(1 = highest role, ${totalRoles} = lowest role)`, 
          inline: true 
        },
        { 
          name: 'How to Move', 
          value: `Use \`${message.prefix}srp @role ${userPosition}\`\nTo move to a different position`, 
          inline: true 
        }
      ],
      thumbnail: message.guild.iconURL({ dynamic: true }),
      footer: { text: `Highest role = 1 | Lowest role = ${totalRoles}` }
    });

    message.reply({ embeds: [embed] });
  },
};