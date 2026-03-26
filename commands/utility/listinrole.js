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

    // Build embeds with proper size limits
    const embeds = [];
    let currentEmbed = new EmbedBuilder()
      .setColor(colors.listinrole || '#3498db')
      .setTitle(`Members in role: ${role.name}`)
      .setThumbnail(role.iconURL({ dynamic: true }));

    // Add role info to first embed only
    currentEmbed.addFields(
      { name: 'Role ID', value: role.id, inline: true },
      { name: 'Member Count', value: `${memberCount}`, inline: true },
    );

    let currentFieldValue = '';
    let fieldCount = 0;
    let estimatedEmbedSize = 200; // Base embed size (title, thumbnail, etc.)

    for (const mention of memberPings) {
      const mentionLength = mention.length + 1; // +1 for newline
      const fieldNameLength = (fieldCount === 0 ? 'Members' : `Members (${fieldCount + 1})`).length;
      
      // Discord embed field format: name + value + some overhead
      const estimatedNewSize = estimatedEmbedSize + currentFieldValue.length + mentionLength + fieldNameLength + 50;

      if (estimatedNewSize > 5500) {
        // Save current field and start a new embed
        const fieldName = fieldCount === 0 ? 'Members' : `Members (${fieldCount + 1})`;
        currentEmbed.addFields({
          name: fieldName,
          value: currentFieldValue.trim(),
          inline: false,
        });

        embeds.push(currentEmbed);

        // Create new embed
        currentEmbed = new EmbedBuilder()
          .setColor(colors.listinrole || '#3498db')
          .setFooter({ text: `Page ${embeds.length + 1}` });

        currentFieldValue = mention + '\n';
        estimatedEmbedSize = 150;
        fieldCount = 0;
      } else {
        currentFieldValue += mention + '\n';
      }
    }

    // Add the last field and embed
    if (currentFieldValue.trim()) {
      const fieldName = fieldCount === 0 ? 'Members' : `Members (${fieldCount + 1})`;
      currentEmbed.addFields({
        name: fieldName,
        value: currentFieldValue.trim(),
        inline: false,
      });
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
