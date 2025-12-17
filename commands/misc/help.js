// commands/misc/help.js
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
        .setTitle('Help')
        .setColor(colors.help || '#22c55e')
        .setDescription(`Prefix: \`${prefix}\` • Use \`${prefix}command\` or mention-based commands if enabled.`)
        .setThumbnail(client.user.displayAvatarURL({ size: 1024 }));

      // build a map category -> lines
      const categories = {};
      // Use a Set to ensure we only show each *primary* command once (avoid duplicate alias entries)
      const seen = new Set();

      // iterate over primary commands only: those where cmd.name lowercased maps to itself
      for (const cmdObj of client.commands.values()) {
        // cmdObj might be same object for aliases; use its primary name
        const name = (cmdObj.name || 'unknown').toString();
        if (seen.has(name)) continue;
        seen.add(name);

        const cat = (cmdObj.category || 'Misc').toString();
        const desc = (cmdObj.description || 'No description.').toString();
        const usage = cmdObj.usage ? `\nUsage: \`${cmdObj.usage}\`` : '';
        const aliases = Array.isArray(cmdObj.aliases) && cmdObj.aliases.length ? `\nAliases: ${cmdObj.aliases.join(', ')}` : '';

        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(`\`${name}\` – ${desc}${aliases}${usage}`);
      }

      // add fields, limit size per field to avoid huge embeds
      for (const [cat, lines] of Object.entries(categories)) {
        embed.addFields({
          name: `${cat[0].toUpperCase() + cat.slice(1)} Commands`,
          value: lines.slice(0, 40).join('\n\n') || 'None', // cap to avoid embed overflow
          inline: false
        });
      }

      // If there were broken command loads, show a tiny note (not full stack)
      if (Array.isArray(client.brokenCommands) && client.brokenCommands.length) {
        const count = client.brokenCommands.length;
        embed.addFields({
          name: 'Broken / Invalid commands',
          value: `There are ${count} command file(s) that failed to load. Use \`${prefix}cmdcheck\` to view them.`,
          inline: false
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Help command failed:', err);
      try { await message.reply('Something went wrong while executing the help command.'); } catch {}
    }
  }
};