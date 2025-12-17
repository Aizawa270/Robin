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
        const name = typeof cmd.name === 'string' ? cmd.name : 'Unknown';
        const category = typeof cmd.category === 'string' ? cmd.category : 'Misc';
        const description = typeof cmd.description === 'string' ? cmd.description : 'No description.';
        const usage = typeof cmd.usage === 'string' ? `\nUsage: \`${cmd.usage}\`` : '';
        const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length
          ? `\nAliases: ${cmd.aliases.join(', ')}`
          : '';

        if (!categories[category]) categories[category] = [];
        categories[category].push(`\`${name}\` – ${description}${aliases}${usage}`);
      }

      // Add a field per category, truncate to prevent embed overflow
      for (const [categoryName, cmds] of Object.entries(categories)) {
        embed.addFields({
          name: `${categoryName[0].toUpperCase() + categoryName.slice(1)} Commands`,
          value: cmds.slice(0, 25).join('\n\n') || 'None', 
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Help command error:', err);
      try { await message.reply('Something went wrong while executing the help command.'); } catch {}
    }
  },
};