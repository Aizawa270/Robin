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
    (byId.type === ChannelType.GuildText || byId.type === ChannelType.GuildAnnouncement)
  ) return byId;

  const byName = guild.channels.cache.find(ch =>
    (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) &&
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

async function applyQuarantineChannelPermissions(channel, roleId) {
  const guild = channel.guild;

  await channel.permissionOverwrites.edit(guild.roles.everyone, {
    ViewChannel: false,
  });

  await channel.permissionOverwrites.edit(roleId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
    AddReactions: true,
  });
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

  try {
    await applyQuarantineChannelPermissions(channel, role.id);
  } catch (err) {
    console.error('[Quarantine] channel permission setup failed:', err);
    return message.reply({
      embeds: [
        makeEmbed(
          '#f59e0b',
          'Quarantine Setup Saved',
          `Saved config for ${channel} and ${role}, but I could not apply channel permissions.\nCheck my permissions and role hierarchy.`
        ),
      ],
    });
  }

  return message.reply({
    embeds: [
      makeEmbed(
        '#22c55e',
        'Quarantine Setup Complete',
        `Quarantine channel set to ${channel}\nQuarantine role set to ${role}`
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
          : 'No quarantine access has been