const { EmbedBuilder } = require('discord.js');
const { colors, prefix } = require('../../config');

module.exports = {
  name: 'help',
  description: 'Shows all available commands and their usage.',
  category: 'utility',
  usage: '$help',
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
        const category = cmd.category || 'Misc';
        if (!categories[category]) categories[category] = [];

        const desc = cmd.description || 'No description.';
        const usage = cmd.usage ? `\nUsage: \`${cmd.usage}\`` : '';
        const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length
          ? `\nAliases: ${cmd.aliases.join(', ')}`
          : '';

        categories[category].push(`\`${cmd.name}\` – ${desc}${aliases}${usage}`);
      }

      // Add fields per category
      for (const [categoryName, cmds] of Object.entries(categories)) {
        embed.addFields({
          name: `${categoryName[0].toUpperCase() + categoryName.slice(1)} Commands`,
          value: cmds.join('\n\n') || 'None',
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in help command:', err);
      message.reply('Something went wrong while executing the help command.');
    }
  },
};