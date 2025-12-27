// commands/economy/ecohelp.js
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const ADMIN_ROLE_IDS = ['1447894643277561856', '1431646610752012420'];

module.exports = {
  name: 'ecohelp',
  description: 'Shows all economy commands with categories',
  category: 'economy',
  usage: '!ecohelp',
  async execute(client, message) {
    const commandsDir = path.join(__dirname);
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js') && f !== 'ecohelp.js');

    const categories = {};

    // Categorize commands
    for (const file of files) {
      const cmd = require(path.join(commandsDir, file));
      if (!cmd.name || !cmd.category) continue;

      // Admin commands only visible if user has role
      if (cmd.adminOnly) {
        const hasRole = message.member.roles.cache.some(r => ADMIN_ROLE_IDS.includes(r.id));
        if (!hasRole) continue;
      }

      if (!categories[cmd.category]) categories[cmd.category] = [];
      categories[cmd.category].push(`\`${cmd.name}\` - ${cmd.description}`);
    }

    const embed = new EmbedBuilder()
      .setTitle('Economy System Help')
      .setColor('#22c55e')
      .setDescription('All economy commands organized by category.');

    for (const [cat, cmds] of Object.entries(categories)) {
      embed.addFields({ name: cat.toUpperCase(), value: cmds.join('\n') });
    }

    embed.setFooter({ text: 'Use commands like !job, !profile, !useitem, !faction, etc.' });

    return message.reply({ embeds: [embed] });
  }
};