const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'removerole',
  description: 'Remove a role from a user. Usage: $removerole @user @role',
  aliases: ['rr'],
  category: 'utility',
  async execute(client, message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You need **Manage Roles** permission.')
        ]
      });
    }

    const member =
      message.mentions.members.first() ||
      message.guild.members.cache.get(args[0]);

    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(args[1]);

    if (!member || !role) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle('Usage')
            .setDescription('$removerole @user @role')
        ]
      });
    }

    // ❌ Self check
    if (member.id === message.author.id) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You cannot remove roles from yourself.')
        ]
      });
    }

    // ❌ Target hierarchy
    if (member.roles.highest.position >= message.member.roles.highest.position) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You cannot modify someone with equal or higher role.')
        ]
      });
    }

    // ❌ Role hierarchy (user)
    if (role.position >= message.member.roles.highest.position) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('You cannot remove a role equal or higher than your highest role.')
        ]
      });
    }

    // ❌ Bot hierarchy
    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('I cannot remove that role because it is above my highest role.')
        ]
      });
    }

    try {
      await member.roles.remove(role);

      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Role Removed')
        .setDescription(`Removed **${role.name}** from **${member.user.tag}**`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

      message.reply({ embeds: [embed] });
    } catch (e) {
      console.error(e);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription('Something went wrong while executing that command.')
        ]
      });
    }
  },
};