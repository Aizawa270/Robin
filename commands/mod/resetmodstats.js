const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

let config = null;
try {
  config = require('../../config');
} catch {}

function getBotOwnerIds(client) {
  const ids = new Set();
  if (config?.ownerId) ids.add(String(config.ownerId));
  if (client?.ownerId) ids.add(String(client.ownerId));
  if (client?.ownerIds && Array.isArray(client.ownerIds)) {
    for (const id of client.ownerIds) ids.add(String(id));
  }
  if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));
  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function hasPermission(client, member) {
  return (
    isAdmin(member) ||
    member.id === member.guild.ownerId ||
    isBotOwner(client, member.id)
  );
}

const VALID_ACTIONS = ['warn', 'ban', 'mute', 'kick', 'unban', 'warnremove'];

module.exports = {
  name: 'resetmodstats',
  description: 'Reset moderation statistics for a user',
  category: 'mod',
  usage: 'resetmodstats <all|warn|ban|mute|kick|unban|warnremove> <@user|userID|username> [amount]',
  aliases: ['removemodstat'],
  async execute(client, message, args) {
    if (!message.guild) return;

    const prefix = client.getPrefix(message.guild.id);

    // Universal permission check
    if (!hasPermission(client, message.member)) {
      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Reset Failed')
        .setDescription('You do not have permission to use this command.')
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // Check if database exists
    if (!client.automodDB) {
      return message.reply('Modstats database not available.');
    }

    // Show usage if no args
    if (!args[0]) {
      const embed = new EmbedBuilder()
        .setTitle('Reset Modstats Usage')
        .setColor('#3498db')
        .setDescription(
          `**Reset all stats:**\n` +
          `\`${prefix}resetmodstats all <@user|userID|username>\`\n\n` +
          `**Reset specific action:**\n` +
          `\`${prefix}resetmodstats <warn|ban|mute|kick|unban|warnremove> <@user|userID|username> [amount]\`\n\n` +
          `**Examples:**\n` +
          `\`${prefix}resetmodstats all @astrix\` - Reset all stats\n` +
          `\`${prefix}resetmodstats ban @astrix\` - Reset all bans\n` +
          `\`${prefix}resetmodstats warn @astrix 5\` - Remove 5 warns`
        );
      return message.reply({ embeds: [embed] });
    }

    const action = args[0].toLowerCase();
    const targetArg = args[1];
    const amount = Number.isInteger(Number(args[2])) && Number(args[2]) > 0 ? Number(args[2]) : null;

    // Validate action
    if (action !== 'all' && !VALID_ACTIONS.includes(action)) {
      return message.reply(`Invalid action. Valid actions: all, ${VALID_ACTIONS.join(', ')}`);
    }

    // Get target user (universal resolver only, no fallback)
    if (!targetArg) {
      return message.reply('Please specify a user.');
    }

    const targetUser = typeof message.resolveUser === 'function'
      ? await message.resolveUser(targetArg)
      : null;

    if (!targetUser) {
      return message.reply('User not found.');
    }

    try {
      let result;
      let deletedCount = 0;

      if (action === 'all') {
        // Reset all stats
        const currentStats = client.automodDB.prepare(`
          SELECT COUNT(*) as total FROM modstats 
          WHERE guild_id = ? AND moderator_id = ?
        `).get(message.guild.id, targetUser.id);

        if (!currentStats || currentStats.total === 0) {
          return message.reply(`${targetUser.tag} has no moderation statistics to reset.`);
        }

        result = client.automodDB.prepare(`
          DELETE FROM modstats 
          WHERE guild_id = ? AND moderator_id = ?
        `).run(message.guild.id, targetUser.id);

        deletedCount = result.changes;

        const embed = new EmbedBuilder()
          .setTitle('✅ All Modstats Reset')
          .setDescription(
            `Successfully reset all moderation statistics for **${targetUser.tag}**\n\n` +
            `**Actions Cleared:** ${deletedCount}\n` +
            `**Reset By:** ${message.author.tag}`
          )
          .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
          .setColor('#22c55e')
          .setTimestamp();

        await message.reply({ embeds: [embed] });
        console.log(`[ResetModStats] ${message.author.tag} reset all stats for ${targetUser.tag} (${deletedCount} entries)`);

      } else {
        // Reset specific action type
        const currentStats = client.automodDB.prepare(`
          SELECT COUNT(*) as total FROM modstats 
          WHERE guild_id = ? AND moderator_id = ? AND action_type = ?
        `).get(message.guild.id, targetUser.id, action);

        if (!currentStats || currentStats.total === 0) {
          return message.reply(`${targetUser.tag} has no **${action}** statistics to reset.`);
        }

        if (amount && amount > 0) {
          // Remove specific amount (delete oldest entries first)
          const toDelete = Math.min(amount, currentStats.total);

          const entries = client.automodDB.prepare(`
            SELECT id FROM modstats 
            WHERE guild_id = ? AND moderator_id = ? AND action_type = ?
            ORDER BY timestamp ASC
            LIMIT ?
          `).all(message.guild.id, targetUser.id, action, toDelete);

          const deleteStmt = client.automodDB.prepare('DELETE FROM modstats WHERE id = ?');

          for (const entry of entries) {
            deleteStmt.run(entry.id);
            deletedCount++;
          }

          const embed = new EmbedBuilder()
            .setTitle(`✅ ${action.charAt(0).toUpperCase() + action.slice(1)} Stats Reduced`)
            .setDescription(
              `Successfully removed **${deletedCount}** ${action} action(s) from **${targetUser.tag}**\n\n` +
              `**Before:** ${currentStats.total}\n` +
              `**After:** ${currentStats.total - deletedCount}\n` +
              `**Reset By:** ${message.author.tag}`
            )
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .setColor('#22c55e')
            .setTimestamp();

          await message.reply({ embeds: [embed] });
          console.log(`[ResetModStats] ${message.author.tag} removed ${deletedCount} ${action} stats from ${targetUser.tag}`);

        } else {
          // Remove all of this action type
          result = client.automodDB.prepare(`
            DELETE FROM modstats 
            WHERE guild_id = ? AND moderator_id = ? AND action_type = ?
          `).run(message.guild.id, targetUser.id, action);

          deletedCount = result.changes;

          const embed = new EmbedBuilder()
            .setTitle(`✅ ${action.charAt(0).toUpperCase() + action.slice(1)} Stats Reset`)
            .setDescription(
              `Successfully reset all **${action}** statistics for **${targetUser.tag}**\n\n` +
              `**Actions Cleared:** ${deletedCount}\n` +
              `**Reset By:** ${message.author.tag}`
            )
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .setColor('#22c55e')
            .setTimestamp();

          await message.reply({ embeds: [embed] });
          console.log(`[ResetModStats] ${message.author.tag} reset ${action} stats for ${targetUser.tag} (${deletedCount} entries)`);
        }
      }

    } catch (error) {
      console.error('[ResetModStats] Error:', error);
      await message.reply('Failed to reset moderation statistics.');
    }
  }
};