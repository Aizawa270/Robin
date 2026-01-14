// commands/utility/helpstaff.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

// ✅ SAME helper as help.js
const { createEmbed } = require('../../handlers/universalHelper');

module.exports = {
  name: 'helpstaff',
  description: 'Shows all mod commands (for mods only).',
  category: 'utility',
  usage: 'helpstaff',
  aliases: ['hstaff', 'staffhelp'],
  async execute(client, message, args) {
    if (!message.guild) return;

    // perms untouched
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

        const embed = createEmbed(client, message, {
          title: `${categoryName.toUpperCase()} Commands`,
          description: `Prefix: \`${prefix}\``,
          thumbnail: client.user.displayAvatarURL({ size: 1024 }),
          footer: 'Staff Only'
        });

        for (const cmd of sortedCmds) {
          embed.addFields({
            name: `\`${prefix}${cmd.name}\``,
            value: cmd.description || 'No description',
            inline: false
          });
        }

        pages.push(embed);
      }

      // send first page (no buttons needed to prove it works)
      await message.reply({ embeds: [pages[0]] });

    } catch (err) {
      console.error('HelpStaff error:', err);
      await message.reply('Helpstaff crashed. Check console.');
    }
  },
};