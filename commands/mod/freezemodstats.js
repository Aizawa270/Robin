// commands/mod/freezemodstats.js
const { EmbedBuilder } = require('discord.js');

const ADMIN_ID = '852839588689870879';
const AUTHORIZED_ROLES = ['1447894643277561856', '1431646610752012420'];

module.exports = {
  name: 'freezemodstats',
  description: 'Freeze modstats tracking for a user or role',
  category: 'mod',
  usage: 'freezemodstats <add|remove|list> <user|role> [@user|@role|userID|roleID|username]',
  aliases: ['freezestats'],
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

    // Show usage if no args
    if (!args[0]) {
      const embed = new EmbedBuilder()
        .setTitle('Freeze Modstats Usage')
        .setColor('#3498db')
        .setDescription(
          '**Freeze a user:**\n' +
          '`!freezemodstats add user <@user|userID|username>`\n\n' +
          '**Freeze a role:**\n' +
          '`!freezemodstats add role <@role|roleID>`\n\n' +
          '**Unfreeze a user:**\n' +
          '`!freezemodstats remove user <@user|userID|username>`\n\n' +
          '**Unfreeze a role:**\n' +
          '`!freezemodstats remove role <@role|roleID>`\n\n' +
          '**List frozen:**\n' +
          '`!freezemodstats list`\n\n' +
          '**Examples:**\n' +
          '`!freezemodstats add user @astrix`\n' +
          '`!freezemodstats add role @Moderator`\n' +
          '`!freezemodstats remove user astrix`'
        );
      return message.reply({ embeds: [embed] });
    }

    const subcommand = args[0].toLowerCase();

    // LIST FROZEN
    if (subcommand === 'list') {
      try {
        const frozenUsers = client.automodDB.prepare(`
          SELECT target_id FROM modstats_frozen 
          WHERE guild_id = ? AND target_type = 'user'
        `).all(message.guild.id);

        const frozenRoles = client.automodDB.prepare(`
          SELECT target_id FROM modstats_frozen 
          WHERE guild_id = ? AND target_type = 'role'
        `).all(message.guild.id);

        const userList = frozenUsers.length > 0
          ? frozenUsers.map(u => `<@${u.target_id}>`).join(', ')
          : 'None';

        const roleList = frozenRoles.length > 0
          ? frozenRoles.map(r => `<@&${r.target_id}>`).join(', ')
          : 'None';

        const embed = new EmbedBuilder()
          .setTitle('Frozen Modstats')
          .setColor('#3498db')
          .addFields(
            { name: `Frozen Users (${frozenUsers.length})`, value: userList },
            { name: `Frozen Roles (${frozenRoles.length})`, value: roleList }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      } catch (error) {
        console.error('[FreezeModStats] List error:', error);
        return message.reply('Failed to retrieve frozen list.');
      }
    }

    // ADD or REMOVE
    if (subcommand !== 'add' && subcommand !== 'remove') {
      return message.reply('Invalid subcommand. Use: `add`, `remove`, or `list`');
    }

    const targetType = args[1]?.toLowerCase();
    if (!targetType || (targetType !== 'user' && targetType !== 'role')) {
      return message.reply('Please specify `user` or `role`.');
    }

    // CREATE TABLE IF NOT EXISTS
    try {
      client.automodDB.prepare(`
        CREATE TABLE IF NOT EXISTS modstats_frozen (
          guild_id TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          added_by TEXT NOT NULL,
          added_at INTEGER DEFAULT (strftime('%s','now')*1000),
          PRIMARY KEY (guild_id, target_type, target_id)
        )
      `).run();
    } catch (e) {
      // Table already exists
    }

    if (targetType === 'user') {
      // FREEZE/UNFREEZE USER
      if (!args[2]) {
        return message.reply('Please specify a user.');
      }

      let targetUser = message.mentions.users.first();

      // Try by ID
      if (!targetUser) {
        targetUser = await client.users.fetch(args[2]).catch(() => null);
      }

      // Try by username
      if (!targetUser && message.guild) {
        const searchTerm = args.slice(2).join(' ').toLowerCase();
        const member = message.guild.members.cache.find(m => 
          m.user.username.toLowerCase() === searchTerm ||
          m.user.tag.toLowerCase() === searchTerm ||
          m.displayName.toLowerCase() === searchTerm
        );
        if (member) targetUser = member.user;
      }

      if (!targetUser) {
        return message.reply('User not found.');
      }

      try {
        if (subcommand === 'add') {
          // Freeze user
          client.automodDB.prepare(`
            INSERT OR IGNORE INTO modstats_frozen (guild_id, target_type, target_id, added_by)
            VALUES (?, ?, ?, ?)
          `).run(message.guild.id, 'user', targetUser.id, message.author.id);

          const embed = new EmbedBuilder()
            .setTitle('❄️ User Modstats Frozen')
            .setDescription(
              `**${targetUser.tag}** will no longer accumulate moderation statistics.\n\n` +
              `All moderation actions by this user will be ignored.`
            )
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .setColor('#3498db')
            .setTimestamp();

          await message.reply({ embeds: [embed] });
          console.log(`[FreezeModStats] ${message.author.tag} froze ${targetUser.tag}`);

        } else {
          // Unfreeze user
          const result = client.automodDB.prepare(`
            DELETE FROM modstats_frozen 
            WHERE guild_id = ? AND target_type = 'user' AND target_id = ?
          `).run(message.guild.id, targetUser.id);

          if (result.changes === 0) {
            return message.reply(`${targetUser.tag} is not frozen.`);
          }

          const embed = new EmbedBuilder()
            .setTitle('✅ User Modstats Unfrozen')
            .setDescription(
              `**${targetUser.tag}** will now accumulate moderation statistics again.`
            )
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .setColor('#22c55e')
            .setTimestamp();

          await message.reply({ embeds: [embed] });
          console.log(`[FreezeModStats] ${message.author.tag} unfroze ${targetUser.tag}`);
        }
      } catch (error) {
        console.error('[FreezeModStats] User error:', error);
        return message.reply('Failed to freeze/unfreeze user.');
      }

    } else {
      // FREEZE/UNFREEZE ROLE
      if (!args[2]) {
        return message.reply('Please specify a role.');
      }

      let targetRole = message.mentions.roles.first();

      // Try by ID
      if (!targetRole) {
        targetRole = message.guild.roles.cache.get(args[2]);
      }

      if (!targetRole) {
        return message.reply('Role not found.');
      }

      try {
        if (subcommand === 'add') {
          // Freeze role
          client.automodDB.prepare(`
            INSERT OR IGNORE INTO modstats_frozen (guild_id, target_type, target_id, added_by)
            VALUES (?, ?, ?, ?)
          `).run(message.guild.id, 'role', targetRole.id, message.author.id);

          const embed = new EmbedBuilder()
            .setTitle('❄️ Role Modstats Frozen')
            .setDescription(
              `All users with **${targetRole.name}** will no longer accumulate moderation statistics.\n\n` +
              `All moderation actions by users with this role will be ignored.`
            )
            .setColor('#3498db')
            .setTimestamp();

          await message.reply({ embeds: [embed] });
          console.log(`[FreezeModStats] ${message.author.tag} froze role ${targetRole.name}`);

        } else {
          // Unfreeze role
          const result = client.automodDB.prepare(`
            DELETE FROM modstats_frozen 
            WHERE guild_id = ? AND target_type = 'role' AND target_id = ?
          `).run(message.guild.id, targetRole.id);

          if (result.changes === 0) {
            return message.reply(`${targetRole.name} is not frozen.`);
          }

          const embed = new EmbedBuilder()
            .setTitle('✅ Role Modstats Unfrozen')
            .setDescription(
              `Users with **${targetRole.name}** will now accumulate moderation statistics again.`
            )
            .setColor('#22c55e')
            .setTimestamp();

          await message.reply({ embeds: [embed] });
          console.log(`[FreezeModStats] ${message.author.tag} unfroze role ${targetRole.name}`);
        }
      } catch (error) {
        console.error('[FreezeModStats] Role error:', error);
        return message.reply('Failed to freeze/unfreeze role.');
      }
    }
  }
};