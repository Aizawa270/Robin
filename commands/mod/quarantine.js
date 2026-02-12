const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const QUARANTINE_ROLE_ID = '1432363678430396436';
const AUTHORIZED_ROLES = [
  '1432015058959073291', // admins invis
  '1432015105045954651', // manager invis
  '1431651904269848667'  // director
];

module.exports = {
  name: 'quarantine',
  aliases: ['q'],
  description: 'Send a user to quarantine.',
  category: 'mod',
  usage: '$quarantine <@user|id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    // Check if user has Administrator OR one of the authorized roles
    const hasAuthorizedRole = AUTHORIZED_ROLES.some(roleId => 
      message.member.roles.cache.has(roleId)
    );

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !hasAuthorizedRole) {
      return message.reply('You do not have permission to use this command.');
    }

    const targetUser =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null));

    if (!targetUser) {
      return message.reply('Please provide a user mention or ID.');
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not found in this server.');

    // Check DB
    const dbRow = client.quarantineDB
      .prepare('SELECT roles FROM quarantine WHERE user_id = ?')
      .get(member.id);

    // Already quarantined check
    if (member.roles.cache.has(QUARANTINE_ROLE_ID)) {
      return message.reply('This user is already in quarantine.');
    }

    // If DB exists but role missing, clean DB
    if (dbRow && !member.roles.cache.has(QUARANTINE_ROLE_ID)) {
      client.quarantineDB
        .prepare('DELETE FROM quarantine WHERE user_id = ?')
        .run(member.id);
    }

    // Save roles (excluding @everyone, managed roles, quarantine role)
    const rolesToSave = [];
    member.roles.cache.forEach(role => {
      if (
        role.id !== message.guild.id &&
        !role.managed &&
        role.id !== QUARANTINE_ROLE_ID
      ) {
        rolesToSave.push(role.id);
      }
    });

    // Save to DB
    client.quarantineDB.prepare(
      'INSERT OR REPLACE INTO quarantine (user_id, roles) VALUES (?, ?)'
    ).run(member.id, JSON.stringify(rolesToSave));

    try {
      // Preserve managed roles
      const managedRoles = Array.from(
        member.roles.cache.filter(r => r.managed).keys()
      );

      await member.roles.set([QUARANTINE_ROLE_ID, ...managedRoles]);
    } catch (err) {
      console.error('Quarantine role set error:', err);

      // Rollback DB
      client.quarantineDB
        .prepare('DELETE FROM quarantine WHERE user_id = ?')
        .run(member.id);

      return message.reply(
        'Failed to set quarantine role. Check bot permissions and role hierarchy.'
      );
    }

    const embed = new EmbedBuilder()
      .setColor('#f87171')
      .setDescription(`Successfully sent **${targetUser.tag}** to the zoo.`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }));

    await message.reply({ embeds: [embed] });
  },
};
