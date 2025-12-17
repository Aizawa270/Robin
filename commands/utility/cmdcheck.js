// commands/utility/cmdcheck.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'cmdcheck',
  description: 'Show broken command files and quick diagnostics.',
  category: 'utility',
  usage: '$cmdcheck',
  aliases: ['cc'],
  async execute(client, message, args) {
    const broken = client.brokenCommands || [];
    if (!broken.length) return message.reply('All command files loaded successfully.');

    const embed = new EmbedBuilder()
      .setTitle('Broken command files')
      .setColor('#ff4757')
      .setDescription(`Found ${broken.length} broken command file(s).`)
      .setTimestamp();

    // show up to 8 failed files with short error lines
    const lines = broken.slice(0, 8).map((b) => {
      const short = (b.error || '').split('\n')[0].replace(/`/g, '');
      return `• \`${b.file.replace(process.cwd(), '')}\` — ${short}`;
    });

    embed.addFields({ name: 'Files', value: lines.join('\n') || 'None', inline: false });

    await message.reply({ embeds: [embed] });
  }
};