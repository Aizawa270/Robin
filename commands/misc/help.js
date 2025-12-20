// commands/utility/help.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'help',
  description: 'Shows all available commands or commands for a specific category.',
  category: 'utility',
  usage: 'help [category]',
  aliases: ['h'],
  async execute(client, message, args) {
    try {
      // Get current prefix dynamically (falls back to $)
      const prefix = typeof client.getPrefix === 'function' ? client.getPrefix(message.guild?.id) : '$';

      // Filter commands: hide hidden ones, mod commands, automod category, and the prefixless admin command
      const allCommands = Array.from(client.commands.values()).filter(cmd =>
        !cmd.hidden &&
        (cmd.category?.toLowerCase() || 'misc') !== 'mod' &&
        (cmd.category?.toLowerCase() || 'misc') !== 'automod' &&
        cmd.name !== 'prefixless'
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
        if (!categories[categoryArg]) {
          return message.reply(`Category "${categoryArg}" not found.`);
        }
        targetCategories = { [categoryArg]: categories[categoryArg] };
      } else {
        targetCategories = categories;
      }

      // Build pages (10 commands per page)
      const pages = [];
      const sortedCategoryEntries = Object.entries(targetCategories).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [categoryName, cmds] of sortedCategoryEntries) {
        // sort commands alphabetically within category
        const sortedCmds = cmds.slice().sort((a, b) => a.name.localeCompare(b.name));
        for (let i = 0; i < sortedCmds.length; i += 10) {
          const chunk = sortedCmds.slice(i, i + 10);
          const embed = new EmbedBuilder()
            .setTitle(`Help – ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}`)
            .setColor(colors.help || '#22c55e')
            .setDescription(`Prefix: \`${prefix}\``)
            .setThumbnail(client.user.displayAvatarURL({ size: 1024 }))
            .setFooter({ text: `Page ${pages.length + 1}` });

          chunk.forEach(cmd => {
            // make usage show dynamic prefix; if command usage already includes a prefix, strip it
            const rawUsage = cmd.usage || '';
            const normalizedUsage = rawUsage.replace(/^[\s$!?.#%&]+/, ''); // remove leading prefix-like char if any
            const usage = normalizedUsage ? `\nUsage: \`${prefix}${normalizedUsage}\`` : '';
            const aliases = cmd.aliases && cmd.aliases.length ? `\nAliases: ${cmd.aliases.join(', ')}` : '';
            embed.addFields({ name: `\`${cmd.name}\``, value: `${cmd.description}${aliases}${usage}`, inline: false });
          });

          pages.push(embed);
        }
      }

      if (!pages.length) return message.reply('No commands to display.');

      // Buttons for navigation
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev_help')
          .setLabel('⬅️ Previous')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('next_help')
          .setLabel('➡️ Next')
          .setStyle(ButtonStyle.Primary)
      );

      let current = 0;
      const helpMsg = await message.reply({ embeds: [pages[current]], components: [row] });

      const collector = helpMsg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 120000, // 2 minutes
      });

      collector.on('collect', async interaction => {
        if (!interaction.isButton()) return;
        if (interaction.customId === 'prev_help') {
          current = current > 0 ? current - 1 : pages.length - 1;
        } else if (interaction.customId === 'next_help') {
          current = current < pages.length - 1 ? current + 1 : 0;
        }
        await interaction.update({ embeds: [pages[current]], components: [row] });
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