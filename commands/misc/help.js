const { EmbedBuilder } = require('discord.js');
const { colors, prefix } = require('../../config');

module.exports = {
  name: 'help',
  description: 'Shows all commands with usage and aliases.',
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

      const categories = {};
      for (const cmd of commands) {
        const name = cmd.name || 'Unknown';
        const category = cmd.category || 'Misc';
        const desc = cmd.description || 'No description.';
        const usage = cmd.usage ? `\nUsage: \`${cmd.usage}\`` : '';
        const aliases =
          Array.isArray(cmd.aliases) && cmd.aliases.length ? `\nAliases: ${cmd.aliases.join(', ')}` : '';

        if (!categories[category]) categories[category] = [];
        categories[category].push(`\`${name}\` – ${desc}${aliases}${usage}`);
      }

      for (const [cat, cmds] of Object.entries(categories)) {
        embed.addFields({
          name: `${cat[0].toUpperCase() + cat.slice(1)} Commands`,
          value: cmds.join('\n\n') || 'None',
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Help command error:', err);
      try {
        await message.reply('Something went wrong while executing the help command.');
      } catch {}
    }
  },
};