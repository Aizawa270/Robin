const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const QUARANTINE_ROLE_ID = '1432363678430396436';

module.exports = {
  name: 'releasequarantine',
  aliases: ['rq'],
  description: 'Release a user from quarantine.',
  category: 'mod',
  usage: '$releasequarantine <@user|id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Only administrators can use this command.');
    }

    const targetUser =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null));

    if (!targetUser) {
      return message.reply('Please provide a user mention or ID.');
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not found in this server.');

    // ✅ Check if user actually has quarantine role
    if (!member.roles.cache.has(QUARANTINE_ROLE_ID)) {
      return message.reply('This user is not in quarantine (no quarantine role found).');
    }

    // Fetch saved roles from database
    const row = client.quarantineDB
      .prepare('SELECT roles FROM quarantine WHERE user_id = ?')
      .get(member.id);

    let rolesToRestore = [];

    if (row) {
      try {
        rolesToRestore = JSON.parse(row.roles || '[]')
          .filter(id => {
            // Check if role exists in guild
            const role = message.guild.roles.cache.get(id);
            return role && role.id !== QUARANTINE_ROLE_ID;
          });
        
        console.log(`[Quarantine] Restoring ${rolesToRestore.length} roles to ${targetUser.tag}`);
      } catch (parseError) {
        console.error('Failed to parse saved roles:', parseError);
        rolesToRestore = [];
      }
    } else {
      console.log(`[Quarantine] No saved roles found for ${targetUser.tag}, restoring default`);
    }

    // Always keep managed roles (booster, integrations)
    const managedRoles = Array.from(member.roles.cache
      .filter(r => r.managed && r.id !== QUARANTINE_ROLE_ID)
      .keys());

    try {
      // Combine roles: restored roles + managed roles
      const finalRoles = [...rolesToRestore, ...managedRoles];
      
      await member.roles.set(finalRoles);
      
      // Clean up database after successful release
      if (row) {
        client.quarantineDB
          .prepare('DELETE FROM quarantine WHERE user_id = ?')
          .run(member.id);
        console.log(`[Quarantine] Database entry cleared for ${targetUser.tag}`);
      }
      
    } catch (err) {
      console.error('Release quarantine error:', err);
      return message.reply('Failed to restore roles. Check bot permissions and role hierarchy.');
    }

    const embed = new EmbedBuilder()
      .setColor('#34d399')
      .setTitle('🔓 Quarantine Released')
      .setDescription(`**${targetUser.tag}** has been released from the zoo.`)
      .addFields(
        { name: 'User ID', value: targetUser.id, inline: true },
        { name: 'Roles Restored', value: `${rolesToRestore.length} roles`, inline: true },
        { name: 'Managed Roles Kept', value: `${managedRoles.length} roles`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true }
      )
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};