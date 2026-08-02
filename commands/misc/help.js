// commands/utility/help.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed } = require('../../handlers/universalHelper');

module.exports = {
  name: 'help',
  description: 'Shows all available commands or commands for a specific category.',
  category: 'utility',
  usage: 'help [category]',
  async execute(client, message, args) {
    try {
      // Get current prefix dynamically (fallback to $)
      const prefix = typeof client.getPrefix === 'function' ? client.getPrefix(message.guild?.id) : '$';

      // Filter commands: hide hidden ones, mod commands, automod category, prefixless, and steal
      const allCommands = Array.from(client.commands.values()).filter(cmd =>
        !cmd.hidden &&
        (cmd.category?.toLowerCase() || 'misc') !== 'mod' &&
        (cmd.category?.toLowerCase() || 'misc') !== 'automod' &&
        cmd.name !== 'prefixless' &&
        cmd.name !== 'steal'
      );

      if (!allCommands.length) return message.reply('No commands loaded.');

      // Determine if user asked for a category
      const categoryArg = args[0]?.toLowerCase();

      // Group commands by category
      const categories = {};
      for (const cmd of allCommands) {
        const cat = (cmd.category || 'Misc').toLowerCase();
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(cmd);
      }

      let targetCategories;
      if (categoryArg) {
        if (!categories[categoryArg]) return message.reply(`Category "${categoryArg}" not found.`);
        targetCategories = { [categoryArg]: categories[categoryArg] };
      } else {
        targetCategories = categories;
      }

      // Build pages - ONE CATEGORY PER PAGE
      const pages = [];
      const sortedCategoryEntries = Object.entries(targetCategories).sort((a, b) => {
        if (a[0] === 'utility') return -1;
        if (b[0] === 'utility') return 1;
        return a[0].localeCompare(b[0]);
      });

      for (const [categoryName, cmds] of sortedCategoryEntries) {
        const sortedCmds = cmds.slice().sort((a, b) => a.name.localeCompare(b.name));
        const pagesNeeded = Math.ceil(sortedCmds.length / 10);

        for (let pageNum = 0; pageNum < pagesNeeded; pageNum++) {
          const start = pageNum * 10;
          const end = start + 10;
          const chunk = sortedCmds.slice(start, end);

          const embed = createEmbed(client, message, {
            title: `${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Commands`,
            description: `Prefix: \`${prefix}\``,
            thumbnail: client.user.displayAvatarURL({ size: 1024 }),
            footer: `Page ${pages.length + 1} • ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} ${pagesNeeded > 1 ? `(${pageNum + 1}/${pagesNeeded})` : ''}`
          });

          chunk.forEach(cmd => {
            const rawUsage = cmd.usage || '';
            const normalizedUsage = rawUsage.replace(/^[\s$!?.#%&]+/, '');
            const usage = normalizedUsage ? `\nUsage: \`${prefix}${normalizedUsage}\`` : '';
            const aliases = cmd.aliases && cmd.aliases.length ? `\nAliases: ${cmd.aliases.join(', ')}` : '';
            embed.addFields({
              name: `\`${prefix}${cmd.name}\``,
              value: `${cmd.description}${aliases}${usage}`,
              inline: false
            });
          });

          pages.push({
            embed,
            categoryName: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
            pageNum: pageNum + 1,
            totalCategoryPages: pagesNeeded
          });
        }
      }

      if (!pages.length) return message.reply('No commands to display.');

      // Category selector buttons
      const uniqueCategories = [...new Set(pages.map(p => p.categoryName))];
      const maxCategoriesPerRow = 5;
      const categoryRows = [];
      for (let i = 0; i < uniqueCategories.length; i += maxCategoriesPerRow) {
        const row = new ActionRowBuilder();
        const chunk = uniqueCategories.slice(i, i + maxCategoriesPerRow);
        chunk.forEach(cat => {
          const isActive = pages[0].categoryName === cat;
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`cat_${cat.toLowerCase()}`)
              .setLabel(cat)
              .setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(isActive)
          );
        });
        categoryRows.push(row);
      }

      // Navigation buttons
      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev_help').setLabel('⬅️ Previous').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('next_help').setLabel('➡️ Next').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('close_help').setLabel('✕ Close').setStyle(ButtonStyle.Danger)
      );

      const allRows = [...categoryRows, navRow];
      let current = 0;
      const helpMsg = await message.reply({ embeds: [pages[current].embed], components: allRows });

      const collector = helpMsg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 180000, // 3 minutes
      });

      collector.on('collect', async interaction => {
        if (!interaction.isButton()) return;

        if (interaction.customId === 'prev_help') current = current > 0 ? current - 1 : pages.length - 1;
        else if (interaction.customId === 'next_help') current = current < pages.length - 1 ? current + 1 : 0;
        else if (interaction.customId === 'close_help') {
          await interaction.update({ components: [] });
          collector.stop();
          return;
        } else if (interaction.customId.startsWith('cat_')) {
          const catName = interaction.customId.slice(4);
          const catIndex = pages.findIndex(p => p.categoryName.toLowerCase() === catName);
          if (catIndex !== -1) current = catIndex;
        }

        // Update category buttons active state
        const updatedCategoryRows = [];
        for (let i = 0; i < uniqueCategories.length; i += maxCategoriesPerRow) {
          const row = new ActionRowBuilder();
          const chunk = uniqueCategories.slice(i, i + maxCategoriesPerRow);
          chunk.forEach(cat => {
            const isActive = pages[current].categoryName === cat;
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`cat_${cat.toLowerCase()}`)
                .setLabel(cat)
                .setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(isActive)
            );
          });
          updatedCategoryRows.push(row);
        }

        const updatedRows = [...updatedCategoryRows, navRow];
        await interaction.update({ embeds: [pages[current].embed], components: updatedRows });
      });

      collector.on('end', async () => {
        try { await helpMsg.edit({ components: [] }); } catch {}
      });

    } catch (err) {
      console.error('Help command error:', err);
      try { await message.reply('Something went wrong while executing the help command.'); } catch {}
    }
  },
};