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
    const memberPings = members.map((m) => `<@${m.id}>`);

    // Chunk mentions into fields (max 1024 chars per field)
    const fields = [];
    let currentValue = '';
    let fieldCount = 0;

    for (let i = 0; i < memberPings.length; i++) {
      const mention = memberPings[i];
      const testValue = currentValue ? currentValue + '\n' + mention : mention;

      if (testValue.length > 1024) {
        // Save current field and start a new one
        fields.push({
          name: fieldCount === 0 ? 'Members' : `Members (continued)`,
          value: currentValue || 'No members',
          inline: false,
        });
        currentValue = mention;
        fieldCount++;
      } else {
        currentValue = testValue;
      }
    }

    // Add the last chunk
    if (currentValue) {
      fields.push({
        name: fieldCount === 0 ? 'Members' : `Members (continued)`,
        value: currentValue,
        inline: false,
      });
    }

    // If no members, add a single field
    if (fields.length === 0) {
      fields.push({
        name: 'Members',
        value: 'No members in this role.',
        inline: false,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(colors.listinrole || '#3498db') // fallback blue
      .setTitle(`Members in role: ${role.name}`)
      .setThumbnail(role.iconURL({ dynamic: true })) // role icon top right
      .addFields(
        { name: 'Role ID', value: role.id, inline: true },
        { name: 'Member Count', value: `${memberCount}`, inline: true },
      )
      .addFields(fields);

    await message.reply({ embeds: [embed] });
  },
};
