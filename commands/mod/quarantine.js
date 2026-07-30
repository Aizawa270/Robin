const {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

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

function resolveTextChannel(guild, input) {
  if (!input) return null;

  const raw = String(input).trim();
  const cleaned = raw.replace(/[<#>]/g, '');

  const byId = guild.channels.cache.get(cleaned);
  if (
    byId &&
    (byId.type === ChannelType.GuildText ||
      byId.type === ChannelType.GuildAnnouncement)
  ) return byId;

  const byName = guild.channels.cache.find(ch =>
    (ch.type === ChannelType.GuildText ||
      ch.type === ChannelType.GuildAnnouncement) &&
    ch.name.toLowerCase() === cleaned.toLowerCase()
  );

  return byName || null;
}

function resolveRole(guild, input) {
  if (!input) return null;

  const raw = String(input).trim();
  const cleaned = raw.replace(/[<@&>]/g, '');

  const byId = guild.roles.cache.get(cleaned);
  if (byId) return byId;

  const byName = guild.roles.cache.find(role =>
    role.name.toLowerCase() === cleaned.toLowerCase()
  );

  return byName || null;
}

async function resolveUser(message, input) {
  if (!input) return null;

  const mention = message.mentions.users.first();
  if (mention) return mention;

  const raw = String(input).trim().replace(/[<@!>]/g, '');
  if (!raw) return null;

  const byId = message.client.users.cache.get(raw);
  if (byId) return byId;

  return message.client.users.fetch(raw).catch(() => null);
}

function getQuarantineSettings(client, guildId) {
  return client.quarantineDB
    .prepare('SELECT channel_id, role_id FROM quarantine_settings WHERE guild_id = ?')
    .get(guildId) || null;
}

function setQuarantineSettings(client, guildId, channelId, roleId) {
  client.quarantineDB
    .prepare(`
      INSERT OR REPLACE INTO quarantine_settings (guild_id, channel_id, role_id)
      VALUES (?, ?, ?)
    `)
    .run(guildId, channelId, roleId);
}

function listAccessEntries(client, guildId) {
  return client.quarantineDB
    .prepare(`
      SELECT target_type, target_id
      FROM quarantine_access
      WHERE guild_id = ?
      ORDER BY target_type, target_id
    `)
    .all(guildId);
}

function addAccessEntry(client, guildId, type, targetId) {
  client.quarantineDB
    .prepare(`
      INSERT OR IGNORE INTO quarantine_access (guild_id, target_type, target_id)
      VALUES (?, ?, ?)
    `)
    .run(guildId, type, targetId);
}

function removeAccessEntry(client, guildId, type, targetId) {
  client.quarantineDB
    .prepare(`
      DELETE FROM quarantine_access
      WHERE guild_id = ? AND target_type = ? AND target_id = ?
    `)
    .run(guildId, type, targetId);
}

function hasAccessEntry(client, guildId, member) {
  const rows = listAccessEntries(client, guildId);
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

function isTextLikeChannel(channel) {
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildForum
  );
}

function isVoiceLikeChannel(channel) {
  return (
    channel.type === ChannelType.GuildVoice ||
    channel.type === ChannelType.GuildStageVoice
  );
}

async function applyQuarantineServerPermissions(guild, quarantineChannelId, roleId) {
  const failedChannels = [];
  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);

  for (const channel of channels.values()) {
    if (!channel || isThreadChannel(channel)) continue;
    if (!channel.permissionOverwrites?.edit) continue;

    try {
      if (channel.id === quarantineChannelId) {
        await channel.permissionOverwrites.edit(guild.roles.everyone, {
          ViewChannel: false,
        });

        const allow = { ViewChannel: true };

        if (isTextLikeChannel(channel)) {
          allow.SendMessages = true;
          allow.ReadMessageHistory = true;
          allow.AttachFiles = true;
          allow.EmbedLinks = true;
          allow.AddReactions = true;
          allow.UseExternalEmojis = true;
        }

        if (isVoiceLikeChannel(channel)) {
          allow.Connect = true;
          allow.Speak = true;
          allow.Stream = true;
          allow.UseVAD = true;
        }

        await channel.permissionOverwrites.edit(roleId, allow);
      } else {
        const deny = { ViewChannel: false };

        if (isTextLikeChannel(channel)) {
          deny.SendMessages = false;
          deny.ReadMessageHistory = false;
        }

        if (isVoiceLikeChannel(channel)) {
          deny.Connect = false;
          deny.Speak = false;
          deny.Stream = false;
          deny.UseVAD = false;
        }

        await channel.permissionOverwrites.edit(roleId, deny);
      }
    } catch (err) {
      failedChannels.push(channel.id);
      console.error(`[Quarantine] Failed to update permissions for channel ${channel.name} (${channel.id}):`, err);
    }
  }

  return failedChannels;
}

async function clearMemberOverwrites(guild, memberId) {
  const failedChannels = [];
  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);

  for (const channel of channels.values()) {
    if (!channel || isThreadChannel(channel)) continue;
    if (!channel.permissionOverwrites?.delete) continue;

    try {
      await channel.permissionOverwrites.delete(memberId);
    } catch (err) {
      failedChannels.push(channel.id);
      console.error(`[Quarantine] Failed to clear member overwrite for ${channel.name} (${channel.id}):`, err);
    }
  }

  return failedChannels;
}

function buildHelp(prefix) {
  return new EmbedBuilder()
    .setColor('#ef4444')
    .setTitle('Quarantine Help')
    .setDescription(
      [
        `**${prefix}quarantineset #channel @role**`,
        `Sets the quarantine channel and quarantine role for this server.`,

        `**${prefix}quarantine setup #channel @role**`,
        `Same setup command, just under the main quarantine command.`,

        `**${prefix}quarantine access add @user/@role**`,
        `Gives a user or role permission to use quarantine commands.`,

        `**${prefix}quarantine access remove @user/@role**`,
        `Removes quarantine command access.`,

        `**${prefix}quarantine access list**`,
        `Shows who can use quarantine commands.`,

        `**${prefix}quarantine @user**`,
        `Sends a user into quarantine.`,

        `**${prefix}releasequarantine @user**`,
        `Releases a user from quarantine.`,
      ].join('\n\n')
    )
    .setFooter({ text: 'Server owners, admins, and bot owner can always use setup/access' });
}

function buildConfig(client, guildId, guild) {
  const cfg = getQuarantineSettings(client, guildId);

  return new EmbedBuilder()
    .setColor('#ef4444')
    .setTitle(`Quarantine Config | ${guild.name}`)
    .setDescription(
      [
        `**Quarantine Channel:** ${cfg?.channel_id ? `<#${cfg.channel_id}>` : '`Not set`'}`,
        `**Quarantine Role:** ${cfg?.role_id ? `<@&${cfg.role_id}>` : '`Not set`'}`,
        `**Access Entries:** \`${listAccessEntries(client, guildId).length}\``,
      ].join('\n')
    )
    .setFooter({ text: `Use ${client.getPrefix(guildId)}quarantine access list to view access` });
}

async function handleSetup(client, message, args) {
  const prefix = client.getPrefix(message.guild.id);

  if (!canManageQuarantineSystem(client, message.member)) {
    return message.reply({
      embeds: [makeEmbed('#ef4444', 'Quarantine Setup Failed', 'You do not have permission to configure quarantine.')],
    });
  }

  const channelInput = args[0];
  const roleInput = args[1];

  const channel = resolveTextChannel(message.guild, channelInput);
  const role = resolveRole(message.guild, roleInput);

  if (!channel || !role) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Quarantine Setup Failed',
          `Usage:\n\`${prefix}quarantineset #channel @role\`\n\`${prefix}quarantine setup #channel @role\``
        ),
      ],
    });
  }

  setQuarantineSettings(client, message.guild.id, channel.id, role.id);

  const failedChannels = await applyQuarantineServerPermissions(message.guild, channel.id, role.id);

  if (failedChannels.length) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Quarantine Setup Complete',
          `Quarantine channel set to ${channel}\nQuarantine role set to ${role}\n\nI updated most channels, but some channels failed. Check my permissions and role hierarchy.`
        ),
      ],
    });
  }

  return message.reply({
    embeds: [
      makeEmbed(
        '#22c55e',
        'Quarantine Setup Complete',
        `Quarantine channel set to ${channel}\nQuarantine role set to ${role}\n\nQuarantined users will only see the quarantine channel now.`
      ),
    ],
  });
}

function parseAccessTarget(message, args) {
  const explicitType = (args[0] || '').toLowerCase();
  let type = null;
  let valueIndex = 0;

  if (explicitType === 'user' || explicitType === 'role') {
    type = explicitType;
    valueIndex = 1;
  }

  const raw = args[valueIndex];
  if (!raw) return null;

  if (type === 'role') {
    const role = resolveRole(message.guild, raw);
    if (!role) return null;
    return { type: 'role', id: role.id, label: `<@&${role.id}>` };
  }

  if (type === 'user') {
    const userMention = message.mentions.users.first();
    if (userMention) return { type: 'user', id: userMention.id, label: `<@${userMention.id}>` };

    const cleaned = String(raw).replace(/[<@!>]/g, '');
    if (!cleaned) return null;

    return { type: 'user', id: cleaned, label: `<@${cleaned}>` };
  }

  const role = resolveRole(message.guild, raw);
  if (role) return { type: 'role', id: role.id, label: `<@&${role.id}>` };

  const cleaned = String(raw).replace(/[<@!>]/g, '');
  if (!cleaned) return null;

  return { type: 'user', id: cleaned, label: `<@${cleaned}>` };
}

async function handleAccess(client, message, args) {
  const prefix = client.getPrefix(message.guild.id);

  if (!canManageQuarantineSystem(client, message.member)) {
    return message.reply({
      embeds: [makeEmbed('#ef4444', 'Access Failed', 'You do not have permission to manage quarantine access.')],
    });
  }

  const sub = (args[0] || '').toLowerCase();

  if (sub === 'list') {
    const rows = listAccessEntries(client, message.guild.id);
    const roles = rows.filter(r => r.target_type === 'role').map(r => `<@&${r.target_id}>`);
    const users = rows.filter(r => r.target_type === 'user').map(r => `<@${r.target_id}>`);

    const embed = new EmbedBuilder()
      .setColor('#3b82f6')
      .setTitle('Quarantine Access List')
      .setTimestamp()
      .setDescription(
        rows.length
          ? `**Roles:**\n${roles.length ? roles.join('\n') : 'None'}\n\n**Users:**\n${users.length ? users.join('\n') : 'None'}`
          : 'No quarantine access has been configured.'
      );

    return message.reply({ embeds: [embed] });
  }

  if (!['add', 'remove'].includes(sub)) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Access Usage',
          `\`${prefix}quarantine access add @user/@role\`\n\`${prefix}quarantine access remove @user/@role\`\n\`${prefix}quarantine access list\``
        ),
      ],
    });
  }

  const target = parseAccessTarget(message, args.slice(1));
  if (!target) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Access Failed',
          `Provide a user or role.\nExample:\n\`${prefix}quarantine access add @Moderator\``
        ),
      ],
    });
  }

  if (sub === 'add') {
    addAccessEntry(client, message.guild.id, target.type, target.id);

    return message.reply({
      embeds: [
        makeEmbed('#22c55e', 'Access Added', `${target.label} can now use quarantine commands.`),
      ],
    });
  }

  removeAccessEntry(client, message.guild.id, target.type, target.id);

  return message.reply({
    embeds: [
      makeEmbed('#ef4444', 'Access Removed', `${target.label} can no longer use quarantine commands.`),
    ],
  });
}

function quarantineRoleIds(member, quarantineRoleId) {
  const rolesToSave = [];
  member.roles.cache.forEach(role => {
    if (
      role.id !== member.guild.id &&
      !role.managed &&
      role.id !== quarantineRoleId
    ) {
      rolesToSave.push(role.id);
    }
  });
  return rolesToSave;
}

function runBackground(fn) {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch(err => console.error('[Quarantine] Background task error:', err));
  });
}

async function handleQuarantine(client, message, args) {
  const prefix = client.getPrefix(message.guild.id);

  if (!canUseQuarantineCommands(client, message.member)) {
    return message.reply({
      embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'You do not have permission to use this command.')],
    });
  }

  const cfg = getQuarantineSettings(client, message.guild.id);
  if (!cfg?.role_id || !cfg?.channel_id) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Quarantine Not Set Up',
          `Run \`${prefix}quarantineset #channel @role\` first.`
        ),
      ],
    });
  }

  const quarantineRole = message.guild.roles.cache.get(cfg.role_id);
  if (!quarantineRole) {
    return message.reply({
      embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'Configured quarantine role no longer exists. Run setup again.')],
    });
  }

  const targetUser =
    message.mentions.users.first() ||
    await resolveUser(message, args[0]);

  if (!targetUser) {
    return message.reply({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Quarantine Failed',
          `Please provide a user mention or ID.\nExample:\n\`${prefix}quarantine @user\``
        ),
      ],
    });
  }

  if (targetUser.bot) {
    return message.reply({
      embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'You cannot quarantine a bot.')],
    });
  }

  if (targetUser.id === message.author.id) {
    return message.reply({
      embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'You cannot quarantine yourself.')],
    });
  }

  const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    return message.reply({
      embeds: [makeEmbed('#f59e0b', 'Quarantine Failed', 'User not found in this server.')],
    });
  }

  if (member.roles.cache.has(quarantineRole.id)) {
    return message.reply({
      embeds: [makeEmbed('#f59e0b', 'Quarantine Failed', 'This user is already quarantined.')],
    });
  }

  if (!canBypassHierarchy(client, message.member)) {
    if (member.id === message.guild.ownerId) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'You cannot quarantine the server owner.')],
      });
    }

    if (message.member.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'You cannot quarantine someone at your level or above.')],
      });
    }
  }

  const existingRow = client.quarantineDB
    .prepare('SELECT roles FROM quarantine WHERE user_id = ?')
    .get(member.id);

  if (existingRow && !member.roles.cache.has(quarantineRole.id)) {
    client.quarantineDB
      .prepare('DELETE FROM quarantine WHERE user_id = ?')
      .run(member.id);
  }

  const rolesToSave = quarantineRoleIds(member, quarantineRole.id);

  client.quarantineDB.prepare(
    'INSERT OR REPLACE INTO quarantine (user_id, roles) VALUES (?, ?)'
  ).run(member.id, JSON.stringify(rolesToSave));

  try {
    const managedRoles = Array.from(member.roles.cache.filter(r => r.managed).keys());
    await member.roles.set([quarantineRole.id, ...managedRoles]);
  } catch (err) {
    console.error('Quarantine role set error:', err);

    client.quarantineDB
      .prepare('DELETE FROM quarantine WHERE user_id = ?')
      .run(member.id);

    return message.reply({
      embeds: [makeEmbed('#ef4444', 'Quarantine Failed', 'Failed to set quarantine role. Check bot permissions and role hierarchy.')],
    });
  }

  await message.reply({
    embeds: [
      makeEmbed('#f87171', 'Quarantine Success', `Successfully sent **${targetUser.tag}** to quarantine.`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 })),
    ],
  });

  runBackground(async () => {
    const clearResult = await clearMemberOverwrites(message.guild, member.id);
    if (clearResult.length) {
      console.warn(`[Quarantine] Some member overwrites failed to clear for ${targetUser.tag}:`, clearResult);
    }
  });
}

module.exports = {
  name: 'quarantine',
  aliases: ['q', 'quarantineset', 'quarantineaccess'],
  description: 'Configure quarantine, manage access, or quarantine a user.',
  category: 'mod',
  usage: '$quarantine <@user|id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const prefix = client.getPrefix(message.guild.id);
    const firstWord = (message.content.trim().split(/\s+/)[0] || '').toLowerCase();
    const trigger = firstWord.startsWith(prefix.toLowerCase())
      ? firstWord.slice(prefix.length).toLowerCase()
      : firstWord;

    if (trigger === 'quarantineset') {
      return handleSetup(client, message, args);
    }

    if (trigger === 'quarantineaccess') {
      return handleAccess(client, message, args);
    }

    const sub = (args[0] || '').toLowerCase();

    if (sub === 'setup' || sub === 'set') {
      return handleSetup(client, message, args.slice(1));
    }

    if (sub === 'access') {
      return handleAccess(client, message, args.slice(1));
    }

    if (sub === 'help' || trigger === 'quarantinehelp') {
      return message.reply({ embeds: [buildHelp(prefix)] });
    }

    if (sub === 'config') {
      return message.reply({ embeds: [buildConfig(client, message.guild.id, message.guild)] });
    }

    return handleQuarantine(client, message, args);
  },
};