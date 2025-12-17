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
      console.log('HELP COMMAND STARTED');

      if (!client.commands || client.commands.size === 0) {
        console.log('No commands loaded in client.commands');
        return message.reply('No commands loaded.');
      }

      const commands = Array.from(new Set(client.commands.values())); // unique commands
      console.log('Commands to process:', commands.map(c => c.name));

      const categories = {};
      for (const cmd of commands) {
        console.log('Processing command:', cmd.name);
        const name = typeof cmd.name === 'string' ? cmd.name : 'Unknown';
        const category = typeof cmd.category === 'string' ? cmd.category : 'Misc';
        const description = typeof cmd.description === 'string' ? cmd.description : 'No description.';
        const usage = typeof cmd.usage === 'string' && cmd.usage ? `\nUsage: \`${cmd.usage}\`` : '';
        const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length ? `\nAliases: ${cmd.aliases.join(', ')}` : '';

        if (!categories[category]) categories[category] = [];
        categories[category].push(`\`${name}\` – ${description}${aliases}${usage}`);
      }

      const embed = new EmbedBuilder()
        .setTitle('Help Menu')
        .setColor(colors.help || '#22c55e')
        .setDescription(`Prefix: \`${prefix}\`\nHere is a list of commands:`)
        .setThumbnail(client.user.displayAvatarURL({ size: 1024 }));

      for (const [categoryName, cmds] of Object.entries(categories)) {
        console.log('Adding category to embed:', categoryName, 'with commands:', cmds.length);
        embed.addFields({
          name: `${categoryName[0].toUpperCase() + categoryName.slice(1)} Commands`,
          value: cmds.slice(0, 25).join('\n\n') || 'None',
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });
      console.log('Help command sent successfully.');
    } catch (err) {
      console.error('HELP COMMAND ERROR:', err);
      try { await message.reply('Something went wrong while executing the help command. Check console logs.'); } catch {}
    }
  },
};