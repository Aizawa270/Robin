const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const WARN_FILE = path.join(__dirname, '../../warns.json');

function loadWarns() {
  try {
    return JSON.parse(fs.readFileSync(WARN_FILE, 'utf8'));
  } catch {
    return {};
  }
}

module.exports = {
  name: 'warns',
  description: 'Shows all warns for a user.',
  category: 'mod',
  usage: '$warns <@user|userID>',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command can only be used in a server.');

    const perms = message.member.permissions;
    const canMod =
      perms.has(PermissionFlagsBits.ModerateMembers) ||
      perms.has(PermissionFlagsBits.Administrator);

    if (!canMod)
      return message.reply('You need **Moderate Members** permission or admin.');

    const targetArg = args[0];
    if (!targetArg) return message.reply('Please mention a user or provide their ID.');

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('Could not find that user.');

    const warns = loadWarns();
    const userWarns = warns[targetUser.id] || [];

    if (userWarns.length === 0)
      return message.reply(`${targetUser.tag} has no warns.`);

    // Build embed
    const embed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle(`Warns for ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .setTimestamp();

    // Add up to 10 warns
    userWarns.slice(0, 10).forEach((w, i) => {
      embed.addFields({
        name: `Warn #${i + 1}`,
        value:
          `**Reason:** ${w.reason}\n` +
          `**By:** ${w.moderator}\n` +
          `**Date:** <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:f>`,
        inline: false,
      });
    });

    if (userWarns.length > 10) {
      embed.addFields({
        name: 'And more...',
        value: `Total warns: ${userWarns.length}`,
      });
    }

    message.reply({ embeds: [embed] });
  },
};