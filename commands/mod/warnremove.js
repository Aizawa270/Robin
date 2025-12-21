const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'warnremove',
  description: 'Remove a specific warn from a user.',
  category: 'mod',
  usage: '$warnremove <@user|userID> <warnNumber> [reason]',
  aliases: ['wrnremove', 'removewarn', 'delwarn'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('You need **Moderate Members** permission.');
    }

    if (args.length < 2) {
      const embed = new EmbedBuilder()
        .setColor('#fde047')
        .setTitle('Warnremove Command Usage')
        .setDescription(
          '**Usage:**\n' +
          '`$warnremove <@user|userID> <warnNumber> [reason]`\n\n' +
          '**Examples:**\n' +
          '`$warnremove @User 1 false positive`\n' +
          '`$warnremove 123456789012345678 2 apology accepted`\n\n' +
          '**Note:** Use `$warns <user>` to see warn numbers.'
        );
      return message.reply({ embeds: [embed] });
    }

    const targetArg = args.shift();
    const warnNumArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    const targetUser = message.mentions.users.first() || 
                      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const warnIndex = parseInt(warnNumArg) - 1;
    if (isNaN(warnIndex) || warnIndex < 0) {
      return message.reply('Invalid warn number. Must be 1 or higher.');
    }

    const guildId = message.guild.id;
    const userId = targetUser.id;

    try {
      // Get all warns for the user
      const warns = client.automodDB.prepare(`
        SELECT id, reason, moderator_id, timestamp 
        FROM automod_warns 
        WHERE guild_id = ? AND user_id = ?
        ORDER BY timestamp DESC
      `).all(guildId, userId);

      if (warns.length === 0) {
        return message.reply('This user has no warnings.');
      }

      if (warnIndex >= warns.length) {
        return message.reply(`Warn #${warnNumArg} not found. User has only ${warns.length} warning(s).\nUse \`$warns ${targetUser.id}\` to see the list.`);
      }

      const warnToRemove = warns[warnIndex];
      const warnReason = warnToRemove.reason || 'No reason';
      const originalModerator = warnToRemove.moderator_id;

      // Delete the warn from database
      const deleteStmt = client.automodDB.prepare(`
        DELETE FROM automod_warns 
        WHERE id = ?
      `);
      const result = deleteStmt.run(warnToRemove.id);

      if (result.changes === 0) {
        return message.reply('Failed to remove the warning. It may have already been removed.');
      }

      // Update warn count
      const newCount = warns.length - 1;
      const updateStmt = client.automodDB.prepare(`
        INSERT OR REPLACE INTO automod_warn_counts (guild_id, user_id, count) 
        VALUES (?, ?, ?)
      `);
      updateStmt.run(guildId, userId, newCount);

      // 🔹 Log to modstats
      const modstatsReason = `Removed warn #${warnNumArg}: ${warnReason} | Reason: ${reason}`;
      logModAction(client, guildId, message.author.id, userId, 'warnremove', modstatsReason);

      // Get moderator name if possible
      let originalModeratorName = 'Unknown';
      try {
        const modUser = await client.users.fetch(originalModerator).catch(() => null);
        if (modUser) originalModeratorName = modUser.tag;
      } catch {}

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('✅ Warn Removed Successfully')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${userId}>`, inline: true },
          { name: 'Remaining Warns', value: `${newCount}`, inline: true },
          { name: 'Removed by', value: `<@${message.author.id}>`, inline: true },
          { name: 'Original Moderator', value: originalModeratorName, inline: true },
          { name: 'Removed Warn Reason', value: warnReason.length > 200 ? warnReason.substring(0, 197) + '...' : warnReason, inline: false },
          { name: 'Removal Reason', value: reason.length > 200 ? reason.substring(0, 197) + '...' : reason, inline: false }
        )
        .setFooter({ text: `Warn #${warnNumArg} removed` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Warnremove command error:', error);
      await message.reply(`❌ Error: ${error.message}`);
    }
  },
};