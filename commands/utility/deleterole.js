const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'deleterole',
  aliases: ['drole'],
  description: 'Delete a role safely.',
  category: 'mod',
  usage: '$deleterole @role',
  async execute(client, message, args) {
    if (!message.guild) return;

    // Admin only
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Admins only.');
    }

    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(args[0]);

    if (!role) {
      return message.reply('Mention a valid role or provide a role ID.');
    }

    // Safety checks
    if (role.id === message.guild.id) {
      return message.reply('You cannot delete @everyone.');
    }

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply('That role is higher than or equal to my role.');
    }

    try {
      const roleName = role.name;
      const roleColor = role.hexColor || '#ef4444';

      await role.delete(`Role deleted by ${message.author.tag}`);

      const embed = new EmbedBuilder()
        .setColor(roleColor)
        .setDescription(`**${roleName}** has been successfully deleted`)
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('DeleteRole error:', err);
      message.reply('Could not delete that role.');
    }
  },
};