const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'addrole',
  description: 'Add a role to a user. Usage: $addrole @user @role',
  aliases: ['ar'],
  category: 'utility',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has('ManageRoles')) return message.reply('You need Manage Roles permission.');

    const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
    if (!member || !role) return message.reply('Usage: $addrole @user @role');

    if (role.position >= message.guild.members.me.roles.highest.position)
      return message.reply('I cannot assign that role because it is above my top role.');

    try {
      await member.roles.add(role);
      const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('Role Added')
        .setDescription(`Added **${role.name}** to **${member.user.tag}**`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
      message.reply({ embeds: [embed] });
    } catch (e) {
      console.error(e);
      message.reply('Something went wrong while executing that command.');
    }
  },
};