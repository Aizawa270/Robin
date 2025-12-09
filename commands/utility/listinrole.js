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
        'Role not found. Provide a valid role ID or mention a role.\nExample: `$listinrole 123456789012345678` or `$listinrole @RoleName`',
      );
    }

    const members = role.members;
    const memberCount = members.size;

    const memberNames = members
      .map((m) => `${m.user.tag}`)
      .slice(0, 50); // limit to avoid embed overflow

    const value =
      memberNames.length > 0
        ? memberNames.join('\n') +
          (memberCount > memberNames.length
            ? `\n...and **${memberCount - memberNames.length}** more`
            : '')
        : 'No members in this role.';

    const embed = new EmbedBuilder()
      .setColor(colors.listinrole)
      .setTitle(`Members in role: ${role.name}`)
      .addFields(
        { name: 'Role ID', value: role.id, inline: true },
        { name: 'Member Count', value: `${memberCount}`, inline: true },
        { name: 'Members', value, inline: false },
      );

    await message.reply({ embeds: [embed] });
  },
};