const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

let config = null;
try {
  config = require('../../config');
} catch {}

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

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
  return !!member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function canManageQuarantineSystem(client, member) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  if (member.id === member.guild.ownerId) return true;
  if (isBotOwner(client, member.id)) return true;
  return false;
}

function canBypassHierarchy(client, member) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  if (member.id === member.guild.ownerId) return true;
  if (isBotOwner(client, member.id)) return true;
  return false;
}

function getQuarantineSettings(client, guildId) {
  return client.quarantineDB
    .prepare('SELECT channel_id, role_id FROM quarantine_settings WHERE guild_id = ?')
    .get(guildId) || null;
}

function getAccessEntries(client, guildId) {
  return client.quarantineDB
    .prepare(`
      SELECT target_type, target_id
      FROM quarantine_access
      WHERE guild_id = ?
    `)
    .all(guildId);
}

function hasAccessEntry(client, guildId, member) {
  const rows = getAccessEntries(client, guildId);
  if (!rows.length) return false;

  for (const row of rows) {
    if (row.target_type === 'user' && row.target_id === member.id) return true;
    if (row.target_type === 'role' && member.roles.cache.has(row.target_id)) return true;
  }

  return false;
}

function canUseQuarantineCommands(client, member) {
  if (!member) return false;
  if (canManageQuarantineSystem(client, member)) return true;
  return hasAccessEntry(client, member.guild.id, member);
}

function isThreadChannel(channel) {
  return typeof channel?.isThread === 'function' && channel.isThread();
}

async function resolveUserStrict(client, message, input) {
  if (!input) return null;

  const query = String(input).trim();
  if (!query) return null;

  const mentionMatch = query.match(/^<@!?(\d{15,20})>$/);
  const id = mentionMatch?.[1] || query.replace(/[<@!>]/g, '');

  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    const cachedMember = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered
    );
    if (cachedMember?.user) return cachedMember.user;

    const fetchedMembers = await message.guild.members.fetch().catch(() => null);
    if (fetchedMembers?.size) {
      const exact = fetchedMembers.find(m =>
        m?.user?.username?.toLowerCase() === lowered
      );
      if (exact?.user) return exact.user;
    }
  }

  return null;
}

function runBackground(fn) {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch(err => console.error('[ReleaseQuarantine] Background task error:', err));
  });
}

async function removeMemberQuarantineLock(guild, memberId) {
  const failed = [];
  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);

  for (const channel of channels.values()) {
    if (!channel || isThreadChannel(channel)) continue;
    if (!channel.permissionOverwrites?.delete) continue;

    try {
      await channel.permissionOverwrites.delete(memberId);
    } catch (err) {
      failed.push(channel.id);
      console.error(
        `[ReleaseQuarantine] Failed to remove member overwrite in ${channel.name} (${channel.id}):`,
        err
      );
    }
  }

  return failed;
}

function buildHelp(prefix) {
  return new EmbedBuilder()
    .setColor('#22c55e')
    .setTitle('Release Quarantine Help')
    .setDescription(
      [
        `**${prefix}releasequarantine @user**`,
        `Releases a user from quarantine and restores their saved roles.`,

        `**${prefix}rq @user**`,
        `Alias for releasequarantine.`,
      ].join('\n\n')
    )
    .setFooter({ text: 'Server owners, admins, bot owner, and access entries can use this command' });
}

module.exports = {
  name: 'releasequarantine',
  aliases: ['rq'],
  description: 'Release a user from quarantine.',
  category: 'mod',
  usage: '$releasequarantine <@user|id|username>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.quarantineDB) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Release Failed', 'Quarantine database is unavailable.')]
      });
    }

    const prefix = client.getPrefix(message.guild.id);
    const firstWord = (message.content.trim().split(/\s+/)[0] || '').toLowerCase();
    const trigger = firstWord.startsWith(prefix.toLowerCase())
      ? firstWord.slice(prefix.length).toLowerCase()
      : firstWord;

    if (trigger === 'help') {
      return message.reply({ embeds: [buildHelp(prefix)] });
    }

    if (!canUseQuarantineCommands(client, message.member)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Release Failed', 'You do not have permission to use this command.')]
      });
    }

    const cfg = getQuarantineSettings(client, message.guild.id);
    if (!cfg?.role_id) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Release Failed',
            `Quarantine is not set up yet. Use \`${prefix}quarantineset #channel @role\`.`
          ),
        ],
      });
    }

    const quarantineRole = message.guild.roles.cache.get(cfg.role_id);
    if (!quarantineRole) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Release Failed', 'Configured quarantine role no longer exists. Run setup again.')]
      });
    }

    const targetUser =
      message.mentions.users.first() ||
      await resolveUserStrict(client, message, args[0]);

    if (!targetUser) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Release Failed',
            `Please provide a user mention, ID, or exact username.\nExample:\n\`${prefix}releasequarantine @user\``
          ),
        ],
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

    if (!member.roles.cache.has(quarantineRole.id) && !dbRow) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Release Failed', 'This user is not in quarantine.')]
      });
    }

    if (!canBypassHierarchy(client, message.member)) {
      if (member.id === message.guild.ownerId) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Release Failed', 'You cannot release the server owner.')]
        });
      }

      if (message.member.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Release Failed', 'You cannot release someone at your level or above.')]
        });
      }
    }

    if (dbRow && !member.roles.cache.has(quarantineRole.id)) {
      try {
        const rolesToRestore = JSON.parse(dbRow.roles || '[]')
          .filter(id => message.guild.roles.cache.has(id));

        const managedRoles = Array.from(
          member.roles.cache.filter(r => r.managed).keys()
        );

        await member.roles.set([...rolesToRestore, ...managedRoles]);

        client.quarantineDB
          .prepare('DELETE FROM quarantine WHERE user_id = ?')
          .run(member.id);

        await message.reply({
          embeds: [
            makeEmbed('#34d399', 'Quarantine Fixed', `Fixed quarantine mismatch for **${member.user.tag}** and restored their roles.`)
              .setThumbnail(targetUser.displayAvatarURL({ size: 1024 })),
          ],
        });

        runBackground(async () => {
          const failed = await removeMemberQuarantineLock(message.guild, member.id);
          if (failed.length) {
            console.warn(`[ReleaseQuarantine] Some member overwrites failed to clear for ${targetUser.tag}:`, failed);
          }
        });

        return;
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
          return role && role.id !== quarantineRole.id;
        });
      } catch {
        rolesToRestore = [];
      }
    }

    const managedRoles = Array.from(
      member.roles.cache.filter(r => r.managed && r.id !== quarantineRole.id).keys()
    );

    try {
      if (dbRow) {
        await member.roles.set([...rolesToRestore, ...managedRoles]);
        client.quarantineDB
          .prepare('DELETE FROM quarantine WHERE user_id = ?')
          .run(member.id);
      } else {
        await member.roles.remove(quarantineRole.id);
      }
    } catch (err) {
      console.error('Release quarantine error:', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Release Failed', 'Failed to restore roles. Check bot permissions and role hierarchy.')]
      });
    }

    await message.reply({
      embeds: [
        makeEmbed('#34d399', 'Quarantine Released', `Successfully removed **${targetUser.tag}** from quarantine.`)
          .setThumbnail(targetUser.displayAvatarURL({ size: 1024 })),
      ],
    });

    runBackground(async () => {
      const failed = await removeMemberQuarantineLock(message.guild, member.id);
      if (failed.length) {
        console.warn(`[ReleaseQuarantine] Some member overwrites failed to clear for ${targetUser.tag}:`, failed);
      }
    });
  },
};