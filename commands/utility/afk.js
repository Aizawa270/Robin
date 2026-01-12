// commands/utility/afk.js
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

    // Set AFK data
    client.afk.set(message.author.id, {
      reason,
      since: Date.now(),
    });

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor(colors.afk || '#94a3b8')
      .setAuthor({
        name: `${message.author.tag} is now AFK`,
        iconURL: message.author.displayAvatarURL({ size: 1024 }),
      })
      .setDescription(`Reason: **${reason}**`);

    await message.reply({ embeds: [embed] });
  },

  /**
   * Helper function to send AFK fallback when someone is pinged
   * Call this inside your messageCreate handler
   */
  sendAfkFallback: async (client, message) => {
    if (!message.mentions.users.size || !client.afk) return;

    for (const [id, user] of message.mentions.users) {
      const afkData = client.afk.get(id);
      if (!afkData) continue;

      const msSince = Date.now() - afkData.since;

      const seconds = Math.floor(msSince / 1000) % 60;
      const minutes = Math.floor(msSince / (1000 * 60)) % 60;
      const hours = Math.floor(msSince / (1000 * 60 * 60)) % 24;
      const days = Math.floor(msSince / (1000 * 60 * 60 * 24));

      let timeStr = '';
      if (days) timeStr += `${days}d `;
      if (hours) timeStr += `${hours}h `;
      if (minutes) timeStr += `${minutes}m `;
      timeStr += `${seconds}s`;

      await message.channel.send(
        `\`${user.tag}\` is AFK: ${afkData.reason} - ${timeStr} ago`
      );
    }
  },
};