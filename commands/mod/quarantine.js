const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const QUARANTINE_ROLE_ID = '1432363678430396436';

module.exports = {
  name: 'quarantine',
  aliases: ['q'],
  description: 'Send a user to quarantine.',
  category: 'mod',
  usage: '$quarantine <@user|id>',

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

    // Check if already quarantined (by role or DB)
    const dbRow = client.quarantineDB
      .prepare('SELECT roles FROM quarantine WHERE user_id = ?')
      .get(member.id);

    if (member.roles.cache.has(QUARANTINE_ROLE_ID) || dbRow) {
      return message.reply('This user is already in quarantine.');
    }

    // ===== SAVE ROLES (EXCLUDE @everyone, managed roles, and quarantine role) =====
    const rolesToSave = [];
    member.roles.cache.forEach(role => {
      // Skip: @everyone role, managed roles (bots, integrations), and quarantine role
      if (role.id !== message.guild.id && !role.managed && role.id !== QUARANTINE_ROLE_ID) {
        rolesToSave.push(role.id);
      }
    });

    // Save to database
    client.quarantineDB.prepare(
      'INSERT OR REPLACE INTO quarantine (user_id, roles) VALUES (?, ?)'
    ).run(member.id, JSON.stringify(rolesToSave));

    try {
      // Keep managed roles (booster, bot, integrations) and add quarantine role
      const managedRoles = Array.from(member.roles.cache
        .filter(r => r.managed)
        .keys());

      await member.roles.set([QUARANTINE_ROLE_ID, ...managedRoles]);
      
      console.log(`[Quarantine] ${targetUser.tag} (${targetUser.id}) quarantined by ${message.author.tag}`);

    } catch (err) {
      console.error('Quarantine role set error:', err);

      // Roll back DB if role set fails
      client.quarantineDB
        .prepare('DELETE FROM quarantine WHERE user_id = ?')
        .run(member.id);

      return message.reply('Failed to set quarantine role. Check bot permissions and role hierarchy.');
    }

    const embed = new EmbedBuilder()
      .setColor('#f87171')
      .setTitle('🔒 Quarantine Activated')
      .setDescription(`**${targetUser.tag}** has been successfully sent to the zoo.`)
      .addFields(
        { name: 'User ID', value: targetUser.id, inline: true },
        { name: 'Roles Saved', value: `${rolesToSave.length} roles`, inline: true },
        { name: 'Moderator', value: message.author.tag, inline: true }
      )
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .setTimestamp()
      .setFooter({ text: 'Use $releasequarantine to release' });

    await message.reply({ embeds: [embed] });
  },
};