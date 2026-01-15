const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

// ✅ SAME helper as help.js
const { createEmbed } = require('../../handlers/universalHelper');

// Helper to chunk arrays into smaller sizes
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

module.exports = {
  name: 'helpstaff',
  description: 'Shows all mod commands (for mods only).',
  category: 'utility',
  usage: 'helpstaff',
  aliases: ['hstaff', 'staffhelp'],
  async execute(client, message, args) {
    if (!message.guild) return;

    // ❌ DO NOT TOUCH PERMS
    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('You must be a mod to use this command.');
    }

    try {
      const prefix =
        typeof client.getPrefix === 'function'
          ? client.getPrefix(message.guild.id)
          : '$';

      const staffCommands = Array.from(client.commands.values()).filter(cmd =>
        !cmd.hidden &&
        (
          cmd.category?.toLowerCase() === 'mod' ||
          cmd.category?.toLowerCase() === 'automod' ||
          cmd.modOnly ||
          cmd.staffOnly
        )
      );

      if (!staffCommands.length) {
        return message.reply('No staff commands found.');
      }

      const categories = {};
      for (const cmd of staffCommands) {
        const cat = (cmd.category || 'Staff').toLowerCase();
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(cmd);
      }

      const pages = [];
      const sortedCategoryEntries = Object.entries(categories);

      for (const [categoryName, cmds] of sortedCategoryEntries) {
        const sortedCmds = cmds.sort((a, b) => a.name.localeCompare(b.name));

        // 25 commands per page (safe under field limits)
        const chunks = chunkArray(sortedCmds, 25);

        for (let i = 0; i < chunks.length; i++) {
          const embed = createEmbed(client, message, {
            title: `${categoryName.toUpperCase()} Commands${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`,
            description: `Prefix: \`${prefix}\``,
            thumbnail: client.user.displayAvatarURL({ size: 1024 }),
            footer: 'Staff Only'
          });

          for (const cmd of chunks[i]) {
            embed.addFields({
              name: `\`${prefix}${cmd.name}\``,
              value: cmd.description || 'No description',
              inline: false
            });
          }

          pages.push(embed);
        }
      }

      // ===== BUTTONS =====
      let current = 0;

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

      const helpMsg = await message.reply({
        embeds: [pages[current]],
        components: pages.length > 1 ? [navRow] : []
      });

      if (pages.length <= 1) return;

      const collector = helpMsg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 180000
      });

      collector.on('collect', async interaction => {
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

        await interaction.update({
          embeds: [pages[current]],
          components: [navRow]
        });
      });

      collector.on('end', async () => {
        try {
          await helpMsg.edit({ components: [] });
        } catch {}
      });

    } catch (err) {
      console.error('HelpStaff error:', err);
      await message.reply('Helpstaff crashed. Check console.');
    }
  },
};