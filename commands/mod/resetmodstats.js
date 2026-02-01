// commands/mod/resetmodstats.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const ADMIN_ID = '852839588689870879';
const AUTHORIZED_ROLES = ['1447894643277561856', '1431646610752012420'];

module.exports = {
  name: 'resetmodstats',
  description: 'Reset moderation statistics for a user',
  category: 'mod',
  usage: 'resetmodstats <@user|userID>',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    // Check permissions
    const isAdmin = message.author.id === ADMIN_ID;
    const hasRole = AUTHORIZED_ROLES.some(roleId => message.member.roles.cache.has(roleId));

    if (!isAdmin && !hasRole) {
      return message.reply('You do not have permission to use this command.');
    }

    // Check if database exists
    if (!client.automodDB) {
      return message.reply('Modstats database not available.');
    }

    // Get target user
    if (!args[0]) {
      return message.reply('Please specify a user.\n\nUsage: `!resetmodstats <@user|userID>`');
    }

    const targetArg = args[0];
    const targetUser = message.mentions.users.first() || 
                       (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) {
      return message.reply('User not found.');
    }

    try {
      // Get current stats before deleting
      const currentStats = client.automodDB.prepare(`
        SELECT COUNT(*) as total FROM modstats 
        WHERE guild_id = ? AND moderator_id = ?
      `).get(message.guild.id, targetUser.id);

      if (!currentStats || currentStats.total === 0) {
        return message.reply(`${targetUser.tag} has no moderation statistics to reset.`);
      }

      // Delete all modstats for this user in this guild
      const result = client.automodDB.prepare(`
        DELETE FROM modstats 
        WHERE guild_id = ? AND moderator_id = ?
      `).run(message.guild.id, targetUser.id);

      const embed = new EmbedBuilder()
        .setTitle('✅ Modstats Reset')
        .setDescription(
          `Successfully reset moderation statistics for **${targetUser.tag}**\n\n` +
          `**Actions Cleared:** ${currentStats.total}\n` +
          `**Reset By:** ${message.author.tag}`
        )
        .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
        .setColor('#22c55e')
        .setTimestamp();

      await message.reply({ embeds: [embed] });

      console.log(`[ResetModStats] ${message.author.tag} reset stats for ${targetUser.tag} (${result.changes} entries deleted)`);

    } catch (error) {
      console.error('[ResetModStats] Error:', error);
      await message.reply('Failed to reset moderation statistics.');
    }
  }
};