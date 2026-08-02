const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveUser } = require('../../handlers/universalHelper');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

module.exports = {
  name: 'warns',
  aliases: ['warnings'],
  description: 'Shows all warns for a user.',
  category: 'mod',
  usage: '$warns <@user|userID|username>',

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warnings Failed', 'This command can only be used in servers.')]
      });
    }

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warnings Failed', 'You need **Moderate Members** permission.')]
      });
    }

    const prefix = message.prefix || client.getPrefix?.(message.guild.id) || '$';

    if (!args.length) {
      return message.reply({
        embeds: [makeEmbed('#facc15', 'Warns Usage', `**Usage:**\n\`${prefix}warns <@user|userID|username>\``)]
      });
    }

    const targetUser = await resolveUser(client, message, args[0]);

    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Warnings Failed', 'User not found.')]
      });
    }

    if (!client.automodDB) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warnings Failed', 'Warning database unavailable.')]
      });
    }

    try {
      const warnings = client.automodDB.prepare(`
        SELECT reason, moderator_id, timestamp
        FROM automod_warns
        WHERE guild_id = ? AND user_id = ?
        ORDER BY timestamp DESC
      `).all(message.guild.id, targetUser.id);

      if (!warnings.length) {
        const embed = new EmbedBuilder()
          .setColor('#22c55e')
          .setTitle('No Warnings')
          .setDescription(`<@${targetUser.id}> has no warnings.`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
          .setFooter({
            text: `Requested by ${message.author.tag}`,
            iconURL: message.author.displayAvatarURL({ size: 64 })
          })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle(`${targetUser.tag}'s Warnings`)
        .setDescription(`Total warnings: **${warnings.length}**`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .setFooter({
          text: `Requested by ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL({ size: 64 })
        })
        .setTimestamp();

      warnings.slice(0, 5).forEach((warn, index) => {
        const time = warn.timestamp
          ? `<t:${Math.floor(warn.timestamp / 1000)}:R>`
          : 'Unknown';

        embed.addFields({
          name: `Warning #${index + 1}`,
          value:
            `**Reason:** ${warn.reason || 'No reason'}\n` +
            `**Moderator:** ${warn.moderator_id ? `<@${warn.moderator_id}>` : 'System'}\n` +
            `**Time:** ${time}`,
          inline: false
        });
      });

      if (warnings.length > 5) {
        embed.addFields({
          name: 'Note',
          value: `Showing 5 newest warnings out of ${warnings.length}.`,
          inline: false
        });
      }

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[Warns] Error:', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warnings Failed', 'Failed to load warnings.')]
      });
    }
  }
};