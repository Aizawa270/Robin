const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

// Helper to calculate embed JSON size
function getEmbedSize(embed) {
  return JSON.stringify(embed.toJSON()).length;
}

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

    if (memberCount === 0) {
      const embed = new EmbedBuilder()
        .setColor(colors.listinrole || '#3498db')
        .setTitle(`Members in role: ${role.name}`)
        .setThumbnail(role.iconURL({ dynamic: true }))
        .addFields(
          { name: 'Role ID', value: role.id, inline: true },
          { name: 'Member Count', value: `${memberCount}`, inline: true },
          { name: 'Members', value: 'No members in this role.', inline: false },
        );

      return await message.reply({ embeds: [embed] });
    }

    // Map members to pings
    const memberPings = members.map((m) => `<@${m.id}>`);

    // Split mentions into chunks of max 1020 chars per field (leave 4 char buffer)
    const fields = [];
    let currentValue = '';
    let fieldNum = 1;

    for (const mention of memberPings) {
      const testValue = currentValue ? currentValue + '\n' + mention : mention;

      if (testValue.length > 1020) {
        // Field is full, save it
        if (currentValue.length > 0) {
          fields.push({
            name: fieldNum === 1 ? 'Members' : `Members (${fieldNum})`,
            value: currentValue,
            inline: false,
          });
          fieldNum++;
        }
        currentValue = mention;
      } else {
        currentValue = testValue;
      }
    }

    // Add the last field
    if (currentValue.length > 0) {
      fields.push({
        name: fieldNum === 1 ? 'Members' : `Members (${fieldNum})`,
        value: currentValue,
        inline: false,
      });
    }

    // Split fields into embeds using actual size calculation
    const embeds = [];
    let currentEmbed = new EmbedBuilder()
      .setColor(colors.listinrole || '#3498db')
      .setTitle(`Members in role: ${role.name}`)
      .setThumbnail(role.iconURL({ dynamic: true }))
      .addFields(
        { name: 'Role ID', value: role.id, inline: true },
        { name: 'Member Count', value: `${memberCount}`, inline: true },
      );

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];

      // Try adding the field
      currentEmbed.addFields(field);

      // Check if embed is too large
      if (getEmbedSize(currentEmbed) > 5500) {
        // Remove the field we just added
        const embedData = currentEmbed.toJSON();
        embedData.fields.pop();
        currentEmbed = EmbedBuilder.from(embedData);

        // Save current embed
        embeds.push(currentEmbed);

        // Create new embed with the field that didn't fit
        currentEmbed = new EmbedBuilder()
          .setColor(colors.listinrole || '#3498db')
          .setFooter({ text: `Page ${embeds.length + 1}` })
          .addFields(field);
      }
    }

    // Add the last embed
    if (currentEmbed.data.fields && currentEmbed.data.fields.length > 0) {
      embeds.push(currentEmbed);
    }

    try {
      await message.reply({ embeds });
    } catch (err) {
      console.error('ListInRole error:', err);
      return message.reply('Failed to display members. Role may be too large.');
    }
  },
};
