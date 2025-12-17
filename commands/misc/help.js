const { EmbedBuilder } = require('discord.js');
const { colors, prefix } = require('../../config');

module.exports = {
  name: 'help',
  description: 'Shows all available commands and their usage.',
  category: 'utility',
  usage: '$help',
  aliases: ['h'],
  async execute(client, message, args) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('Help Menu')
        .setColor(colors.help || '#22c55e')
        .setDescription(`Prefix: \`${prefix}\`\nHere is a list of commands:`)
        .setThumbnail(client.user.displayAvatarURL({ size: 1024 }));

      const commands = Array.from(client.commands.values());

      // Group commands by category
      const categories = {};
      for (const cmd of commands) {
        const name = cmd.name?.toString() || 'Unknown';
        const category = cmd.category?.toString() || 'Misc';
        const desc = cmd.description?.toString() || 'No description.';
        const usage = cmd.usage ? `\nUsage: \`${cmd.usage}\`` : '';
        const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length
          ? `\nAliases: ${cmd.aliases.join(', ')}`
          : '';

        if (!categories[category]) categories[category] = [];
        categories[category].push(`\`${name}\` – ${desc}${aliases}${usage}`);
      }

      // Add fields per category safely
      for (const [categoryName, cmds] of Object.entries(categories)) {
        embed.addFields({
          name: `${categoryName[0].toUpperCase() + categoryName.slice(1)} Commands`,
          value: cmds.slice(0, 50).join('\n\n') || 'None', // slice to prevent too many lines
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in help command:', err);
      try { await message.reply('Something went wrong while executing the help command.'); } catch {}
    }
  },
};