const { EmbedBuilder } = require('discord.js');
const { colors, prefix } = require('../../config');

function chunkString(str, maxLength = 900) {
  const chunks = [];
  let current = '';
  for (const line of str.split('\n')) {
    if ((current + line + '\n').length > maxLength) {
      chunks.push(current);
      current = line + '\n';
    } else {
      current += line + '\n';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

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
        .setDescription(`Prefix: \`${prefix}\`\nHere is a list of commands by category:`)
        .setThumbnail(client.user.displayAvatarURL({ size: 1024 }));

      // Group commands by category
      const categories = {};
      for (const cmd of client.commands.values()) {
        const name = typeof cmd.name === 'string' ? cmd.name : 'Unknown';
        const category = typeof cmd.category === 'string' ? cmd.category : 'Misc';
        const description = typeof cmd.description === 'string' ? cmd.description : 'No description.';
        const usage = typeof cmd.usage === 'string' && cmd.usage ? `\nUsage: \`${cmd.usage}\`` : '';
        const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length
          ? `\nAliases: ${cmd.aliases.join(', ')}`
          : '';

        if (!categories[category]) categories[category] = [];
        categories[category].push(`\`${name}\` – ${description}${aliases}${usage}`);
      }

      // Add fields per category, split if too long
      for (const [categoryName, cmds] of Object.entries(categories)) {
        const content = cmds.join('\n\n');
        const chunks = chunkString(content, 900); // leave buffer under 1024
        chunks.forEach((chunk, i) => {
          embed.addFields({
            name: i === 0 ? `${categoryName[0].toUpperCase() + categoryName.slice(1)} Commands` : '\u200B',
            value: chunk,
            inline: false,
          });
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Help command error:', err);
      try { await message.reply('Something went wrong while executing the help command.'); } catch {}
    }
  },
};