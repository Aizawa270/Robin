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

    // Split mentions into chunks of max 1024 chars per field
    const fields = [];
    let currentValue = '';
    let fieldNum = 0;

    for (const mention of memberPings) {
      const testValue = currentValue ? currentValue + '\n' + mention : mention;

      if (testValue.length > 1024) {
        // Field is full, save it
        if (currentValue.length > 0) {
          fields.push({
            name: fieldNum === 0 ? 'Members' : `Members (cont. ${fieldNum})`,
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
        name: fieldNum === 0 ? 'Members' : `Members (cont. ${fieldNum})`,
        value: currentValue,
        inline: false,
      });
    }

    // Now split fields into embeds (max 6000 chars per embed, max 25 fields per embed)
    const embeds = [];
    let currentEmbed = new EmbedBuilder()
      .setColor(colors.listinrole || '#3498db')
      .setTitle(`Members in role: ${role.name}`)
      .setThumbnail(role.iconURL({ dynamic: true }))
      .addFields(
        { name: 'Role ID', value: role.id, inline: true },
        { name: 'Member Count', value: `${memberCount}`, inline: true },
      );

    let currentEmbedSize = 300;
    let fieldsInCurrentEmbed = 2; // Already added Role ID and Member Count

    for (const field of fields) {
      const fieldSize = field.name.length + field.value.length + 50;

      // Check if adding this field would exceed limits
      if (fieldsInCurrentEmbed >= 25 || currentEmbedSize + fieldSize > 5500) {
        // Save current embed and create a new one
        embeds.push(currentEmbed);

        currentEmbed = new EmbedBuilder()
          .setColor(colors.listinrole || '#3498db')
          .setFooter({ text: `Page ${embeds.length + 1}` });

        currentEmbedSize = 100;
        fieldsInCurrentEmbed = 0;
      }

      currentEmbed.addFields(field);
      currentEmbedSize += fieldSize;
      fieldsInCurrentEmbed++;
    }

    // Add the last embed
    if (fieldsInCurrentEmbed > 0) {
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
