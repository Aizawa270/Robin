// commands/economy/ecohelp.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ehelp',
  description: 'Economy help: lists economy commands.',
  category: 'economy',
  usage: '!ehelp',
  aliases: ['ecohelp','help economy','help:economy'],
  async execute(client, message, args) {
    const embed = new EmbedBuilder()
      .setTitle('Vynora Economy — Help')
      .setColor('#0ea5e9')
      .setDescription('Economy commands (shortcut: `!ehelp`)')
      .addFields(
        { name: 'Basics', value: '`register` · `bal` · `profile` · `ehelp`', inline: false },
        { name: 'Daily / Monthly', value: '`daily` · `monthly`', inline: false },
        { name: 'Jobs', value: '`joblist` · `jobapply <slug|id>` · `work` · `jobinfo <slug|id>` · `jobexp` · `jobleave` · `joblb`', inline: false }
      )
      .setFooter({ text: 'More modules: help faction / help gambling coming soon' });

    return message.reply({ embeds: [embed] });
  }
};