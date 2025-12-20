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
    if (!message.guild) return message.reply('Server only.');

    const perms = message.member.permissions;
    if (
      !perms.has(PermissionFlagsBits.ModerateMembers) &&
      !perms.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('No perms.');
    }

    const targetArg = args[0];
    if (!targetArg) return message.reply('Provide a user.');

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const fakePingUser = `<@${targetUser.id}>`;

    // ===== AUTOMOD DB PATH =====
    try {
      if (client.automod && typeof client.automod.listWarns === 'function') {
        const rows = client.automod.listWarns(message.guild.id, targetUser.id) || [];
        const total =
          typeof client.automod.getWarnCount === 'function'
            ? client.automod.getWarnCount(message.guild.id, targetUser.id)
            : rows.length;

        if (!rows.length) return message.reply('User has no warns.');

        const embed = new EmbedBuilder()
          .setColor('#facc15')
          .setTitle('User Warnings')
          .setDescription(`Warnings for ${fakePingUser}`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
          .setTimestamp();

        const slice = rows.slice(0, 10);

        for (let i = 0; i < slice.length; i++) {
          const w = slice[i];
          const modPing = w.moderator_id ? `<@${w.moderator_id}>` : 'Unknown';
          const date = w.timestamp
            ? `<t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:f>`
            : 'Unknown';

          embed.addFields({
            name: `Warn #${i + 1}`,
            value:
              `**Reason:** ${w.reason || 'No reason provided'}\n` +
              `**By:** ${modPing}\n` +
              `**Date:** ${date}`,
            inline: false,
          });
        }

        if (total > 10) {
          embed.addFields({
            name: 'More warnings',
            value: `Total warns: **${total}**`,
          });
        }

        return message.reply({ embeds: [embed] });
      }
    } catch (err) {
      console.error('warns automod error:', err);
    }

    // ===== FILE FALLBACK =====
    const warns = loadWarnsFile();
    const userWarns = warns[targetUser.id] || [];

    if (!userWarns.length) return message.reply('User has no warns.');

    const embed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle('User Warnings')
      .setDescription(`Warnings for ${fakePingUser}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .setTimestamp();

    userWarns.slice(0, 10).forEach((w, i) => {
      let modPing = 'Unknown';

      if (w.moderator && w.moderator.includes('(')) {
        const id = w.moderator.match(/\((\d+)\)/)?.[1];
        if (id) modPing = `<@${id}>`;
      }

      embed.addFields({
        name: `Warn #${i + 1}`,
        value:
          `**Reason:** ${w.reason}\n` +
          `**By:** ${modPing}\n` +
          `**Date:** <t:${Math.floor(new Date(w.timestamp).getTime() / 1000)}:f>`,
        inline: false,
      });
    });

    if (userWarns.length > 10) {
      embed.addFields({
        name: 'More warnings',
        value: `Total warns: **${userWarns.length}**`,
      });
    }

    return message.reply({ embeds: [embed] });
  },
};