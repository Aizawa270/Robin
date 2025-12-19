const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'listinrole',
  description: 'Lists all members in a given role by ID or mention.',
  category: 'utility',
  usage: '$listinrole <roleID or @role>',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // Refresh member cache
    await message.guild.members.fetch().catch(() => null);

    const roleFromMention = message.mentions.roles.first();
    const roleIdArg = args[0];
    let role = roleFromMention || message.guild.roles.cache.get(roleIdArg);

    if (!role) {
      return message.reply(
        'Role not found. Provide a valid role ID or mention a role.\nExample: `$listinrole 123456789012345678` or `$listinrole @RoleName`',
      );
    }

    const members = role.members;
    const memberCount = members.size;

    // Map members to pings
    const memberPings = members
      .map((m) => `<@${m.id}>`)
      .slice(0, 50); // limit to avoid embed overflow

    const value =
      memberPings.length > 0
        ? memberPings.join('\n') +
          (memberCount > memberPings.length
            ? `\n...and **${memberCount - memberPings.length}** more`
            : '')
        : 'No members in this role.';

    const embed = new EmbedBuilder()
      .setColor(colors.listinrole || '#3498db') // fallback blue
      .setTitle(`Members in role: ${role.name}`)
      .setThumbnail(role.iconURL({ dynamic: true })) // role icon top right
      .addFields(
        { name: 'Role ID', value: role.id, inline: true },
        { name: 'Member Count', value: `${memberCount}`, inline: true },
        { name: 'Members', value, inline: false },
      );

    await message.reply({ embeds: [embed] });
  },
};