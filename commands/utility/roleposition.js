const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'roleposition',
  description: 'Get the position of a role. Usage: $roleposition @role',
  aliases: ['rp'],
  category: 'utility',
  async execute(client, message, args) {
    if (!message.guild) return;

    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    if (!role) return message.reply('Usage: $roleposition @role');

    // Flip position: top role = 1
    const flippedPosition = message.guild.roles.cache.size - role.position;

    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setTitle('Role Position')
      .setDescription(`**${role.name}** is at position **${flippedPosition}**`)
      .setThumbnail(message.guild.iconURL({ dynamic: true }));

    message.reply({ embeds: [embed] });
  },
};