const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const WARN_FILE = path.join(__dirname, '../../warns.json');

function loadWarnsFile() {
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

    // Prefer using automod DB if available
    try {
      if (client.automod && typeof client.automod.listWarns === 'function') {
        const rows = client.automod.listWarns(message.guild.id, targetUser.id) || [];
        const total = (typeof client.automod.getWarnCount === 'function')
          ? client.automod.getWarnCount(message.guild.id, targetUser.id)
          : rows.length;

        if (!rows.length) return message.reply(`${targetUser.tag} has no warns.`);

        const embed = new EmbedBuilder()
          .setColor('#facc15')
          .setTitle(`Warns for ${targetUser.tag}`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
          .setTimestamp();

        // Add up to 10 warns (most recent first)
        const slice = rows.slice(0, 10);
        for (let i = 0; i < slice.length; i++) {
          const w = slice[i];
          // columns: moderator_id, reason, timestamp
          let modText = w.moderator_id || 'Unknown';
          try {
            if (w.moderator_id) {
              const modUser = await client.users.fetch(w.moderator_id).catch(() => null);
              if (modUser) modText = `${modUser.tag} (${modUser.id})`;
            }
          } catch {}
          const date = w.timestamp ? `<t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:f>` : 'Unknown';
          embed.addFields({
            name: `Warn #${i + 1}`,
            value:
              `**Reason:** ${w.reason || 'No reason provided'}\n` +
              `**By:** ${modText}\n` +
              `**Date:** ${date}`,
            inline: false,
          });
        }

        if (total > 10) {
          embed.addFields({
            name: 'And more...',
            value: `Total warns: ${total}`,
          });
        }

        return message.reply({ embeds: [embed] });
      }
    } catch (err) {
      console.error('warns command automod DB error:', err);
      // fallthrough to file-based fallback
    }

    // --- Fallback to file-based warns (older format) ---
    const warns = loadWarnsFile();
    const userWarns = warns[targetUser.id] || [];

    if (userWarns.length === 0)
      return message.reply(`${targetUser.tag} has no warns.`);

    const embed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle(`Warns for ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .setTimestamp();

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

    return message.reply({ embeds: [embed] });
  },
};