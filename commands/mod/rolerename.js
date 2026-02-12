const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'rolerename',
  aliases: ['rrename'],
  description: 'Rename a role by ID or mention.',
  category: 'mod',
  usage: '$rolerename <role id|@role> <new name>',
  async execute(client, message, args) {
    if (!message.guild) return;

    // Check for Administrator OR Manage Roles permission
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && 
        !message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('You need Administrator or Manage Roles permission to use this.');
    }

    if (args.length < 2) {
      return message.reply(
        'Usage: `$rolerename <role id|@role> <new name>`\nExample: `$rolerename @Members NewName`'
      );
    }

    // Resolve role
    let role;
    const roleArg = args.shift();
    // Mentioned role
    if (message.mentions.roles.size) {
      role = message.mentions.roles.first();
    } else if (/^\d+$/.test(roleArg)) {
      role = message.guild.roles.cache.get(roleArg);
    }

    if (!role) return message.reply('Could not find that role.');

    const newName = args.join(' ');

    try {
      await role.setName(newName, `Renamed by ${message.author.tag}`);

      const embed = new EmbedBuilder()
        .setColor(role.color || '#3498db')
        .setDescription(`**${role.name}** has been renamed successfully to **${newName}**`)
        .setFooter({ text: `Role ID: ${role.id}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('RoleRename error:', err);
      message.reply('Something broke. Check bot permissions and role hierarchy.');
    }
  },
};
