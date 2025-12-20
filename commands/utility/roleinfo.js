const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'roleinfo',
  aliases: ['ri'], // ✅ added alias
  description: 'Shows information about a role by ID or mention.',
  category: 'utility',
  usage: '$roleinfo <roleID or @role>',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Refresh member cache so role.members is up to date
    await message.guild.members.fetch().catch(() => null);

    const roleFromMention = message.mentions.roles.first();
    const roleIdArg = args[0];

    let role = null;

    if (roleFromMention) {
      role = roleFromMention;
    } else if (roleIdArg) {
      role = message.guild.roles.cache.get(roleIdArg);
    }

    if (!role) {
      return message.reply(
        'Role not found. Provide a valid role ID or mention a role.\nExample: `$roleinfo 123456789012345678` or `$roleinfo @RoleName`',
      );
    }

    const memberCount = role.members.size;
    const embedColor = role.hexColor && role.hexColor !== '#000000' ? role.hexColor : '#94a3b8'; // fallback

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle('Role Information')
      .setThumbnail(role.iconURL({ size: 1024 }) || null) // top-right role icon
      .addFields(
        { name: 'Role Name', value: role.name, inline: true },
        { name: 'Role ID', value: role.id, inline: true },
        {
          name: 'Color (Hex)',
          value: role.hexColor && role.hexColor !== '#000000' ? role.hexColor : 'None',
          inline: true,
        },
        { name: 'Member Count', value: `${memberCount}`, inline: true },
        { name: 'Mentionable?', value: role.mentionable ? 'Yes' : 'No', inline: true },
        { name: 'Hoisted?', value: role.hoist ? 'Yes' : 'No', inline: true },
      );

    await message.reply({ embeds: [embed] });
  },
};