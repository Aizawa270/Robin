const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'roleposition',
  description: 'Get the position of a role.',
  aliases: ['rp'],
  category: 'utility',

  async execute(client, message, args) {
    if (!message.guild) return;

    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(args[0]);

    if (!role) {
      return message.reply('Usage: $roleposition @role');
    }

    const totalRoles = message.guild.roles.cache.size;
    const rolePosition = totalRoles - role.position;

    // CLEAN EMBED — NO EXTRA BS
    const embed = message.createEmbed({
      title: 'Role Position',
      description: `${role}\n\n**Position:** ${rolePosition}`,
    });

    await message.reply({ embeds: [embed] });
  },
};