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

    // Fetch DB row
    const dbRow = client.quarantineDB
      .prepare('SELECT roles FROM quarantine WHERE user_id = ?')
      .get(member.id);

    // Check if user is quarantined
    if (!member.roles.cache.has(QUARANTINE_ROLE_ID) && !dbRow) {
      return message.reply('This user is not in quarantine.');
    }

    // If role missing but DB exists, restore roles from DB
    if (!member.roles.cache.has(QUARANTINE_ROLE_ID) && dbRow) {
      try {
        const rolesToRestore = JSON.parse(dbRow.roles || '[]').filter(id => message.guild.roles.cache.has(id));
        await member.roles.set([...rolesToRestore]);

        client.quarantineDB
          .prepare('DELETE FROM quarantine WHERE user_id = ?')
          .run(member.id);

        return message.reply(`Fixed quarantine mismatch for **${member.user.tag}**, roles restored.`);
      } catch (err) {
        console.error('Fix quarantine mismatch error:', err);
        return message.reply('Failed to fix quarantine mismatch.');
      }
    }

    // Normal release
    let rolesToRestore = [];
    if (dbRow) {
      try {
        rolesToRestore = JSON.parse(dbRow.roles || '[]').filter(id => {
          const role = message.guild.roles.cache.get(id);
          return role && role.id !== QUARANTINE_ROLE_ID;
        });
      } catch {
        rolesToRestore = [];
      }
    }

    // Preserve managed roles
    const managedRoles = Array.from(
      member.roles.cache.filter(r => r.managed && r.id !== QUARANTINE_ROLE_ID).keys()
    );

    try {
      await member.roles.set([...rolesToRestore, ...managedRoles]);

      // Clean DB
      if (dbRow) {
        client.quarantineDB
          .prepare('DELETE FROM quarantine WHERE user_id = ?')
          .run(member.id);
      }
    } catch (err) {
      console.error('Release quarantine error:', err);
      return message.reply(
        'Failed to restore roles. Check bot permissions and role hierarchy.'
      );
    }

    const embed = new EmbedBuilder()
      .setColor('#34d399')
      .setDescription(`Successfully removed **${targetUser.tag}** from the zoo.`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }));

    await message.reply({ embeds: [embed] });
  },
};