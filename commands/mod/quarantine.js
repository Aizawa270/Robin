const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const QUARANTINE_ROLE_ID = '1432363678430396436';
const AUTHORIZED_ROLES = [
  '1432015058959073291', // admins invis
  '1432015105045954651', // manager invis
  '1431651904269848667'  // director
];

const ROLE_LEVELS = {
  '1432015058959073291': 1, // admin
  '1432015105045954651': 2, // manager
  '1431651904269848667': 3, // director
};

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

function getQuarantineLevelFromMember(member) {
  let level = 0;

  for (const roleId of AUTHORIZED_ROLES) {
    if (member.roles.cache.has(roleId)) {
      level = Math.max(level, ROLE_LEVELS[roleId] || 0);
    }
  }

  if (member.permissions?.has(PermissionFlagsBits.Administrator)) {
    level = Math.max(level, 1);
  }

  return level;
}

module.exports = {
  name: 'quarantine',
  aliases: ['q'],
  description: 'Send a user to quarantine.',
  category: 'mod',
  usage: '$quarantine <@user|id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const hasAuthorizedRole = AUTHORIZED_ROLES.some(roleId => message.member.roles.cache.has(roleId));

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !hasAuthorizedRole) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'You do not have permission to use this command.')]
      });
    }

    const targetUser =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null));

    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Quarantine Failed', 'Please provide a user mention or ID.')]
      });
    }

    if (targetUser.id === message.author.id) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'You cannot quarantine yourself.')]
      });
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Quarantine Failed', 'User not found in this server.')]
      });
    }

    if (member.roles.cache.has(QUARANTINE_ROLE_ID)) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Quarantine Failed', 'This user is already in quarantine.')]
      });
    }

    const actorLevel = getQuarantineLevelFromMember(message.member);
    const targetLevel = getQuarantineLevelFromMember(member);

    if (targetLevel >= actorLevel && message.author.id !== message.guild.ownerId) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'You cannot quarantine someone at your level or above.')]
      });
    }

    const dbRow = client.quarantineDB
      .prepare('SELECT roles FROM quarantine WHERE user_id = ?')
      .get(member.id);

    if (dbRow && !member.roles.cache.has(QUARANTINE_ROLE_ID)) {
      client.quarantineDB
        .prepare('DELETE FROM quarantine WHERE user_id = ?')
        .run(member.id);
    }

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

    client.quarantineDB.prepare(
      'INSERT OR REPLACE INTO quarantine (user_id, roles) VALUES (?, ?)'
    ).run(member.id, JSON.stringify(rolesToSave));

    try {
      const managedRoles = Array.from(member.roles.cache.filter(r => r.managed).keys());
      await member.roles.set([QUARANTINE_ROLE_ID, ...managedRoles]);
    } catch (err) {
      console.error('Quarantine role set error:', err);

      client.quarantineDB
        .prepare('DELETE FROM quarantine WHERE user_id = ?')
        .run(member.id);

      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'Failed to set quarantine role. Check bot permissions and role hierarchy.')]
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#f87171')
      .setDescription(`Successfully sent **${targetUser.tag}** to the zoo.`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }));

    await message.reply({ embeds: [embed] });
  },
};