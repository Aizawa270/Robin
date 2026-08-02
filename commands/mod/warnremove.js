const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');
const { resolveUser } = require('../../handlers/universalHelper');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

module.exports = {
  name: 'warnremove',
  description: 'Remove a warning from a user.',
  category: 'mod',
  usage: '$warnremove <@user|userID|username> <warnNumber> [reason]',
  aliases: ['wrnremove', 'removewarn', 'delwarn'],

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Remove Failed', 'This command can only be used in servers.')]
      });
    }

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Remove Failed', 'You need **Moderate Members** permission.')]
      });
    }

    const prefix = message.prefix || client.getPrefix?.(message.guild.id) || '$';

    if (args.length < 2) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#facc15',
            'Warnremove Usage',
            `**Usage:**\n\`${prefix}warnremove <@user|userID|username> <warn number> [reason]\`\n\nExample:\n\`${prefix}warnremove @User 2 spam cleared\``
          )
        ]
      });
    }

    const targetInput = args.shift();
    const warnNumber = Number(args.shift());
    const reason = args.join(' ').trim() || 'No reason provided';

    if (!Number.isInteger(warnNumber) || warnNumber < 1) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Warn Remove Failed', 'Warn number must be a valid number.')]
      });
    }

    const targetUser = await resolveUser(client, message, targetInput);

    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Warn Remove Failed', 'User not found.')]
      });
    }

    if (targetUser.id === message.author.id) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Remove Failed', 'You cannot remove your own warning.')]
      });
    }

    if (!client.automodDB) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Remove Failed', 'Warning database is unavailable.')]
      });
    }

    try {
      const warns = client.automodDB.prepare(`
        SELECT id, reason, moderator_id, timestamp
        FROM automod_warns
        WHERE guild_id = ? AND user_id = ?
        ORDER BY timestamp DESC
      `).all(message.guild.id, targetUser.id);

      if (!warns.length) {
        return message.reply({
          embeds: [makeEmbed('#f59e0b', 'No Warnings', `<@${targetUser.id}> has no warnings.`)]
        });
      }

      if (warnNumber > warns.length) {
        return message.reply({
          embeds: [makeEmbed('#f59e0b', 'Warn Remove Failed', `That user only has ${warns.length} warning(s).`)]
        });
      }

      const warn = warns[warnNumber - 1];

      client.automodDB.prepare(`
        DELETE FROM automod_warns
        WHERE id = ?
      `).run(warn.id);

      const remaining = client.automodDB.prepare(`
        SELECT COUNT(*) AS count
        FROM automod_warns
        WHERE guild_id = ? AND user_id = ?
      `).get(message.guild.id, targetUser.id);

      client.automodDB.prepare(`
        INSERT OR REPLACE INTO automod_warn_counts
        (guild_id, user_id, count)
        VALUES (?, ?, ?)
      `).run(message.guild.id, targetUser.id, remaining.count);

      logModAction(
        client,
        message.guild.id,
        message.author.id,
        targetUser.id,
        'warnremove',
        `Removed warn #${warnNumber}: ${warn.reason || 'No reason'}`
      );

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Warn Removed')
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Warn Removed', value: `#${warnNumber}`, inline: true },
          { name: 'Removed By', value: `<@${message.author.id}>`, inline: true },
          { name: 'Original Reason', value: warn.reason || 'No reason', inline: false },
          { name: 'Removal Reason', value: reason, inline: false },
          { name: 'Remaining Warns', value: `${remaining.count}/5`, inline: true }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[WarnRemove] Error:', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Remove Failed', 'Failed to remove warning.')]
      });
    }
  }
};