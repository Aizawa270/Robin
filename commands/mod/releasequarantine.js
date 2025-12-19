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

    // ✅ ROLE = SOURCE OF TRUTH
    if (!member.roles.cache.has(QUARANTINE_ROLE_ID)) {
      return message.reply('This user is not in quarantine.');
    }

    // Fetch saved roles (if any)
    const row = client.quarantineDB
      .prepare('SELECT roles FROM quarantine WHERE user_id = ?')
      .get(member.id);

    let rolesToRestore = [];

    if (row) {
      rolesToRestore = JSON.parse(row.roles)
        .filter(id => message.guild.roles.cache.has(id));

      client.quarantineDB
        .prepare('DELETE FROM quarantine WHERE user_id = ?')
        .run(member.id);
    }

    // Always keep managed roles (booster, integrations)
    const managedRoles = member.roles.cache
      .filter(r => r.managed)
      .map(r => r.id);

    try {
      await member.roles.set([...rolesToRestore, ...managedRoles]);
    } catch (err) {
      console.error(err);
      return message.reply('Failed to restore roles. Check bot permissions.');
    }

    const embed = new EmbedBuilder()
      .setColor('#34d399')
      .setTitle('Quarantine Released')
      .setDescription(`**${targetUser.tag}** has been released from the zoo.`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};