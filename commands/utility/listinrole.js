const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { colors } = require('../../config');

// How many member mentions to show per page
const MEMBERS_PER_PAGE = 30;

// Build a single page embed
function buildEmbed(role, memberCount, pageMembers, page, totalPages) {
  return new EmbedBuilder()
    .setColor(colors.listinrole || '#3498db')
    .setTitle(`Members in role: ${role.name}`)
    .setThumbnail(role.iconURL({ dynamic: true }))
    .addFields(
      { name: 'Role ID', value: role.id, inline: true },
      { name: 'Member Count', value: `${memberCount}`, inline: true },
      { name: 'Members', value: pageMembers.join('\n') || 'No members.', inline: false },
    )
    .setFooter({ text: `Page ${page} of ${totalPages}` });
}

// Build the prev/next button row
function buildButtons(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages),
  );
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
          { name: 'Member Count', value: '0', inline: true },
          { name: 'Members', value: 'No members in this role.', inline: false },
        );

      return message.reply({ embeds: [embed] });
    }

    // Split all member pings into pages of MEMBERS_PER_PAGE
    const memberPings = members.map((m) => `<@${m.id}>`);
    const pages = [];
    for (let i = 0; i < memberPings.length; i += MEMBERS_PER_PAGE) {
      pages.push(memberPings.slice(i, i + MEMBERS_PER_PAGE));
    }

    const totalPages = pages.length;
    let currentPage = 1;

    const embed = buildEmbed(role, memberCount, pages[0], 1, totalPages);

    // If only one page, no buttons needed
    if (totalPages === 1) {
      return message.reply({ embeds: [embed] });
    }

    const row = buildButtons(1, totalPages);
    const reply = await message.reply({ embeds: [embed], components: [row] });

    // Collect button interactions — only from the original command author
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === message.author.id,
      time: 5 * 60 * 1000, // 5 minutes
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'prev') {
        currentPage = Math.max(1, currentPage - 1);
      } else if (interaction.customId === 'next') {
        currentPage = Math.min(totalPages, currentPage + 1);
      }

      const newEmbed = buildEmbed(role, memberCount, pages[currentPage - 1], currentPage, totalPages);
      const newRow = buildButtons(currentPage, totalPages);

      await interaction.update({ embeds: [newEmbed], components: [newRow] });
    });

    collector.on('end', async () => {
      // Disable buttons when collector expires
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev')
          .setLabel('◀ Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      );

      await reply.edit({ components: [disabledRow] }).catch(() => null);
    });
  },
};
