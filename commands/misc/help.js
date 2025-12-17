const { EmbedBuilder } = require('discord.js');
const { colors, prefix } = require('../../config');

module.exports = {
  name: 'help',
  description: 'Shows the list of commands and what they do.',
  category: 'misc',
  usage: '$help',
  async execute(client, message, args) {
    const commands = client.commands;

    // Group by category
    const categories = {};

    for (const command of commands.values()) {
      const category = command.category || 'other';
      if (!categories[category]) categories[category] = [];
      categories[category].push(command);
    }

    // Sort categories alphabetically
    const sortedCategoryNames = Object.keys(categories).sort((a, b) =>
      a.localeCompare(b),
    );

    const embed = new EmbedBuilder()
      .setTitle('Help Menu')
      .setColor(colors.help || '#22c55e')
      .setDescription(
        `Prefix: \`${prefix}\`\n` +
          'Here is a list of my commands. Use `command` syntax like shown in usage.',
      )
      .setThumbnail(client.user.displayAvatarURL({ size: 1024 }));

    for (const categoryName of sortedCategoryNames) {
      const cmds = categories[categoryName];

      // Format each command safely
      const value = cmds
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((cmd) => {
          const usage = cmd.usage ? `\nUsage: \`${cmd.usage}\`` : '';
          const aliases =
            Array.isArray(cmd.aliases) && cmd.aliases.length
              ? `\nAliases: \`${cmd.aliases.join('`, `')}\``
              : '';
          const desc = cmd.description || 'No description.';
          return `\`${cmd.name}\` – ${desc}${aliases}${usage}`;
        })
        .join('\n\n');

      const prettyName = categoryName[0].toUpperCase() + categoryName.slice(1);

      embed.addFields({
        name: `${prettyName} Commands`,
        value: value || 'None',
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  },
};