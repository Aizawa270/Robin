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

function getLevelFromMember(member) {
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

function getLevelFromStoredRoles(roleIds, guild) {
  let level = 0;
  for (const roleId of roleIds) {
    if (!guild.roles.cache.has(roleId)) continue;
    if (ROLE_LEVELS[roleId]) {
      level = Math.max(level, ROLE_LEVELS[roleId]);
    }
  }
  return level;
}

module.exports = {
  name: 'releasequarantine',
  aliases: ['rq'],
  description: 'Release a user from quarantine.',
  category: 'mod',
  usage: '$releasequarantine <@user|id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const hasAuthorizedRole = AUTHORIZED_ROLES.some(roleId => message.member.roles.cache.has(roleId));

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !hasAuthorizedRole) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Release Failed', 'You do not have permission to use this command.')]
      });
    }

    const targetUser =
      message.mentions.users.first() ||
      (args[0] && await client.users.fetch(args[0]).catch(() => null));

    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Release Failed', 'Please provide a user mention or ID.')]
      });
    }

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Release Failed', 'User not found in this server.')]
      });
    }

    const dbRow = client.quarantineDB
      .prepare('SELECT roles FROM quarantine WHERE user_id = ?')
      .get(member.id);

    if (!member.roles.cache.has(QUARANTINE_ROLE_ID) && !dbRow) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Release Failed', 'This user is not in quarantine.')]
      });
    }

    const actorLevel = getLevelFromMember(message.member);
    const targetLevel = dbRow
      ? getLevelFromStoredRoles(JSON.parse(dbRow.roles || '[]'), message.guild)
      : getLevelFromMember(member);

    if (targetLevel >= actorLevel && message.author.id !== message.guild.ownerId) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Release Failed', 'You cannot release someone at your level or above.')]
      });
    }

    if (!member.roles.cache.has(QUARANTINE_ROLE_ID) && dbRow) {
      try {
        const rolesToRestore = JSON.parse(dbRow.roles || '[]').filter(id => message.guild.roles.cache.has(id));
        await member.roles.set([...rolesToRestore]);

        client.quarantineDB
          .prepare('DELETE FROM quarantine WHERE user_id = ?')
          .run(member.id);

        return message.reply({
          embeds: [makeEmbed('#34d399', 'Quarantine Fixed', `Fixed quarantine mismatch for **${member.user.tag}**, roles restored.`)]
        });
      } catch (err) {
        console.error('Fix quarantine mismatch error:', err);
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Release Failed', 'Failed to fix quarantine mismatch.')]
        });
      }
    }

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

    const managedRoles = Array.from(
      member.roles.cache.filter(r => r.managed && r.id !== QUARANTINE_ROLE_ID).keys()
    );

    try {
      await member.roles.set([...rolesToRestore, ...managedRoles]);

      if (dbRow) {
        client.quarantineDB
          .prepare('DELETE FROM quarantine WHERE user_id = ?')
          .run(member.id);
      }
    } catch (err) {
      console.error('Release quarantine error:', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Release Failed', 'Failed to restore roles. Check bot permissions and role hierarchy.')]
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#34d399')
      .setDescription(`Successfully removed **${targetUser.tag}** from the zoo.`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }));

    await message.reply({ embeds: [embed] });
  },
};