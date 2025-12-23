// commands/utility/helpstaff.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'helpstaff',
  description: 'Shows all mod commands (for mods only).',
  category: 'utility',
  usage: 'helpstaff',
  aliases: ['hstaff', 'staffhelp'],
  async execute(client, message, args) {
    if (!message.guild) return;

    // Only mods
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
        !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You must be a mod to use this command.');
    }

    try {
      // Get current prefix dynamically
      const prefix = typeof client.getPrefix === 'function' ? client.getPrefix(message.guild?.id) : '$';

      // Get mod and automod commands from client.commands
      const staffCommands = Array.from(client.commands.values()).filter(cmd =>
        !cmd.hidden && 
        ((cmd.category?.toLowerCase() === 'mod' || cmd.category?.toLowerCase() === 'automod') ||
         (cmd.modOnly || cmd.staffOnly))
      );

      if (!staffCommands.length) {
        return message.reply('No staff commands found.');
      }

      // Group commands by category
      const categories = {};
      for (const cmd of staffCommands) {
        const cat = (cmd.category || 'Staff').toLowerCase();
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(cmd);
      }

      // Build pages - ONE CATEGORY PER PAGE
      const pages = [];
      
      // Sort categories: Mod first, then Automod, then others
      const sortedCategoryEntries = Object.entries(categories).sort((a, b) => {
        const order = ['mod', 'automod'];
        const aIndex = order.indexOf(a[0]);
        const bIndex = order.indexOf(b[0]);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a[0].localeCompare(b[0]);
      });
      
      for (const [categoryName, cmds] of sortedCategoryEntries) {
        // Sort commands alphabetically within category
        const sortedCmds = cmds.slice().sort((a, b) => a.name.localeCompare(b.name));
        
        // Calculate how many pages needed for this category (10 commands per page)
        const pagesNeeded = Math.ceil(sortedCmds.length / 10);
        
        for (let pageNum = 0; pageNum < pagesNeeded; pageNum++) {
          const start = pageNum * 10;
          const end = start + 10;
          const chunk = sortedCmds.slice(start, end);
          
          const embed = new EmbedBuilder()
            .setTitle(`${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Commands`)
            .setColor(colors.help || '#22c55e')
            .setDescription(`Prefix: \`${prefix}\``)
            .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
            .setFooter({ 
              text: `Page ${pages.length + 1} • Staff Only • ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} ${pagesNeeded > 1 ? `(${pageNum + 1}/${pagesNeeded})` : ''}` 
            });

          chunk.forEach(cmd => {
            // Format usage with dynamic prefix
            const rawUsage = cmd.usage || '';
            const normalizedUsage = rawUsage.replace(/^[\s$!?.#%&]+/, '');
            const usage = normalizedUsage ? `\nUsage: \`${prefix}${normalizedUsage}\`` : '';
            const aliases = cmd.aliases && cmd.aliases.length ? `\nAliases: ${cmd.aliases.join(', ')}` : '';
            const perms = cmd.permissions ? `\nRequired: ${cmd.permissions}` : '';
            embed.addFields({ 
              name: `\`${prefix}${cmd.name}\``, 
              value: `${cmd.description}${aliases}${usage}${perms}`, 
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

      // Create category selector buttons (first row)
      const categoryButtons = [];
      const uniqueCategories = [...new Set(pages.map(p => p.categoryName))];
      const maxCategoriesPerRow = 5;
      
      // Create category selector rows
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

      // Navigation buttons (last row)
      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev_staff')
          .setLabel('⬅️ Previous')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('next_staff')
          .setLabel('➡️ Next')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('close_staff')
          .setLabel('✕ Close')
          .setStyle(ButtonStyle.Danger)
      );

      // Combine all rows
      const allRows = [...categoryRows, navRow];

      let current = 0;
      const helpMsg = await message.reply({ 
        embeds: [pages[current].embed], 
        components: allRows 
      });

      const collector = helpMsg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 180000, // 3 minutes
      });

      collector.on('collect', async interaction => {
        if (!interaction.isButton()) return;
        
        if (interaction.customId === 'prev_staff') {
          current = current > 0 ? current - 1 : pages.length - 1;
        } 
        else if (interaction.customId === 'next_staff') {
          current = current < pages.length - 1 ? current + 1 : 0;
        }
        else if (interaction.customId === 'close_staff') {
          await interaction.update({ components: [] });
          collector.stop();
          return;
        }
        else if (interaction.customId.startsWith('cat_')) {
          const catName = interaction.customId.slice(4);
          // Find first page of this category
          const catIndex = pages.findIndex(p => p.categoryName.toLowerCase() === catName);
          if (catIndex !== -1) current = catIndex;
        }

        // Update category buttons to reflect active state
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
        await interaction.update({ 
          embeds: [pages[current].embed], 
          components: updatedRows 
        });
      });

      collector.on('end', async () => {
        try { 
          await helpMsg.edit({ components: [] }); 
        } catch {}
      });

    } catch (err) {
      console.error('HelpStaff command error:', err);
      try { await message.reply('Something went wrong while executing the helpstaff command.'); } catch {}
    }
  },
};