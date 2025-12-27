// commands/economy/ecohelp.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const ORDER = [
  'Jobs', 'Gambling', 'Faction', 'Economy', 'Items', 'Wallet', 'Admin', 'Utility', 'Mod', 'Misc'
];

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

module.exports = {
  name: 'ecohelp',
  aliases: ['ehelp', 'economyhelp'],
  category: 'economy',
  usage: '!ecohelp',
  description: 'Show all economy-related commands (jobs / gambling / faction / items / etc). Paginated.',
  async execute(client, message) {
    // build prefix
    const prefix = message.prefix || client.getPrefix?.(message.guild?.id) || '!';

    // Group commands by category
    const groups = new Map();
    client.commands.forEach(cmd => {
      const catRaw = (cmd.category || 'Misc').toString();
      // normalize capitalization: first letter upper, rest lower
      const cat = catRaw.charAt(0).toUpperCase() + catRaw.slice(1).toLowerCase();
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(cmd);
    });

    // Build ordered sections (only categories that exist)
    const availableCategories = [];
    for (const name of ORDER) {
      if (groups.has(name)) availableCategories.push({ name, cmds: groups.get(name) });
    }
    // Add any remaining categories not in ORDER
    for (const [name, cmds] of groups.entries()) {
      if (!ORDER.map(x => x.toLowerCase()).includes(name.toLowerCase())) {
        availableCategories.push({ name, cmds });
      }
    }

    if (!availableCategories.length) {
      return message.reply('No commands available to show.');
    }

    // Build pages: each category gets its own series of pages (8 commands per page)
    const pages = [];
    for (const section of availableCategories) {
      const cmds = section.cmds
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(c => {
          const usage = c.usage ? `\`${c.usage.replace(/^\$|^!/g, prefix)}\`` : `\`${prefix}${c.name}\``;
          return { name: c.name, desc: c.description || 'No description', usage };
        });
      const chunks = chunkArray(cmds, 8);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embed = new EmbedBuilder()
          .setTitle(`${section.name} Commands`)
          .setColor('#1f2937') // dark neutral color
          .setFooter({ text: `Page ${pages.length + 1} • Use the buttons below to navigate` });

        const lines = chunk.map(c => `**${c.usage}**\n${c.desc}`);
        embed.setDescription(lines.join('\n\n'));

        pages.push(embed);
      }
    }

    // If only one page, just send it
    if (pages.length === 1) {
      return message.reply({ embeds: [pages[0]] });
    }

    // Buttons
    const prevBtn = new ButtonBuilder().setCustomId('eco_prev').setLabel('Prev').setStyle(ButtonStyle.Secondary);
    const nextBtn = new ButtonBuilder().setCustomId('eco_next').setLabel('Next').setStyle(ButtonStyle.Primary);
    const closeBtn = new ButtonBuilder().setCustomId('eco_close').setLabel('Close').setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(prevBtn, closeBtn, nextBtn);

    let index = 0;
    const sent = await message.reply({ embeds: [pages[index]], components: [row] });

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 2 * 60 * 1000
    });

    collector.on('collect', async (interaction) => {
      // only the user who ran the command can interact
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: 'You are not allowed to control this help menu.', ephemeral: true });
      }

      try {
        if (interaction.customId === 'eco_prev') {
          index = (index - 1 + pages.length) % pages.length;
          await interaction.update({ embeds: [pages[index]], components: [row] });
          return;
        }
        if (interaction.customId === 'eco_next') {
          index = (index + 1) % pages.length;
          await interaction.update({ embeds: [pages[index]], components: [row] });
          return;
        }
        if (interaction.customId === 'eco_close') {
          await interaction.update({ content: 'Help closed.', embeds: [], components: [] });
          collector.stop('closed');
          return;
        }
      } catch (err) {
        console.error('ecohelp interaction error:', err);
      }
    });

    collector.on('end', async () => {
      try {
        // disable buttons after timeout/close
        const disabledRow = new ActionRowBuilder().addComponents(
          prevBtn.setDisabled(true),
          closeBtn.setDisabled(true),
          nextBtn.setDisabled(true)
        );
        await sent.edit({ components: [disabledRow] }).catch(() => {});
      } catch (e) {}
    });
  }
};