const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'afk',
  description: 'Sets your AFK status with an optional reason.',
  category: 'utility',
  usage: '$afk <reason>',
  async execute(client, message, args) {
    const reason = args.join(' ') || 'AFK';

    if (!client.afk) client.afk = new Map();

    client.afk.set(message.author.id, {
      reason,
      since: Date.now(),
    });

    const embed = new EmbedBuilder()
      .setColor(colors.afk || '#94a3b8')
      .setAuthor({
        name: `${message.author.tag} is now AFK`,
        iconURL: message.author.displayAvatarURL({ size: 1024 }),
      })
      .setDescription(`Reason: **${reason}**`);

    await message.reply({ embeds: [embed] });
  },
};