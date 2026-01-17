// handlers/modlogsHandler.js
const {
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  AuditLogEvent
} = require('discord.js');

const LIGHT_PINK = '#FF69B4';
const CATEGORY_ID = '1431692511289802872';

// ---------------- DB helpers ----------------
function setModlogsChannel(client, guildId, channelId) {
  if (!client?.automodDB) return false;
  client.automodDB.prepare(`INSERT OR REPLACE INTO modlogs_channel (guild_id, channel_id) VALUES (?, ?)`).run(guildId, channelId);
  return true;
}

function getModlogsChannel(client, guildId) {
  if (!client?.automodDB) return null;
  const r = client.automodDB.prepare(`SELECT channel_id FROM modlogs_channel WHERE guild_id = ?`).get(guildId);
  return r?.channel_id || null;
}

// ---------------- Auto-create modlogs channel ----------------
async function ensureModlogsChannel(client, guild) {
  try {
    let channelId = getModlogsChannel(client, guild.id);
    
    // Check if channel exists
    if (channelId) {
      const exists = await guild.channels.fetch(channelId).catch(() => null);
      if (exists) return exists;
    }

    // Create new modlogs channel
    const channel = await guild.channels.create({
      name: '📋・mod-logs',
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel]
        }
      ]
    });

    setModlogsChannel(client, guild.id, channel.id);
    console.log(`[Modlogs] Created mod-logs channel for ${guild.name}`);
    return channel;
  } catch (err) {
    console.error('[Modlogs] Failed to create channel:', err);
    return null;
  }
}

// ---------------- Log functions ----------------
async function logMessageDelete(client, message) {
  try {
    if (!message.guild || message.author?.bot) return;
    
    const channel = await ensureModlogsChannel(client, message.guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Message Deleted')
      .setColor('#ef4444')
      .setThumbnail(message.author?.displayAvatarURL({ size: 128 }) || null)
      .addFields(
        { name: 'Author', value: `${message.author?.tag || 'Unknown'} (${message.author?.id || 'Unknown'})`, inline: true },
        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: 'Message ID', value: message.id, inline: true }
      )
      .setTimestamp();

    if (message.content) {
      embed.addFields({ name: 'Content', value: message.content.substring(0, 1024) || 'No content' });
    }

    // Handle attachments
    if (message.attachments.size > 0) {
      const attachmentList = message.attachments.map(a => `[${a.name}](${a.url})`).join('\n');
      embed.addFields({ name: 'Attachments', value: attachmentList.substring(0, 1024) });
      
      // Try to embed first image
      const firstImage = message.attachments.find(a => a.contentType?.startsWith('image/'));
      if (firstImage) {
        embed.setImage(firstImage.url);
      }
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logMessageDelete error:', err);
  }
}

async function logMessageUpdate(client, oldMessage, newMessage) {
  try {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // Ignore embed updates
    
    const channel = await ensureModlogsChannel(client, newMessage.guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('✏️ Message Edited')
      .setColor('#f59e0b')
      .setThumbnail(newMessage.author?.displayAvatarURL({ size: 128 }) || null)
      .addFields(
        { name: 'Author', value: `${newMessage.author?.tag || 'Unknown'} (${newMessage.author?.id || 'Unknown'})`, inline: true },
        { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
        { name: 'Message ID', value: newMessage.id, inline: true },
        { name: 'Before', value: oldMessage.content?.substring(0, 1024) || 'No content' },
        { name: 'After', value: newMessage.content?.substring(0, 1024) || 'No content' }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logMessageUpdate error:', err);
  }
}

async function logBan(client, guild, user, moderator = null, reason = null) {
  try {
    const channel = await ensureModlogsChannel(client, guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🔨 User Banned')
      .setColor('#dc2626')
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown', inline: true }
      )
      .setTimestamp();

    if (reason) {
      embed.addFields({ name: 'Reason', value: reason.substring(0, 1024) });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logBan error:', err);
  }
}

async function logUnban(client, guild, user, moderator = null) {
  try {
    const channel = await ensureModlogsChannel(client, guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('✅ User Unbanned')
      .setColor('#22c55e')
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown', inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logUnban error:', err);
  }
}

async function logKick(client, guild, user, moderator = null, reason = null) {
  try {
    const channel = await ensureModlogsChannel(client, guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('👢 User Kicked')
      .setColor('#f97316')
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown', inline: true }
      )
      .setTimestamp();

    if (reason) {
      embed.addFields({ name: 'Reason', value: reason.substring(0, 1024) });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logKick error:', err);
  }
}

async function logMute(client, guild, user, moderator = null, reason = null, duration = null) {
  try {
    const channel = await ensureModlogsChannel(client, guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🔇 User Muted')
      .setColor('#8b5cf6')
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown', inline: true }
      )
      .setTimestamp();

    if (duration) {
      embed.addFields({ name: 'Duration', value: duration, inline: true });
    }

    if (reason) {
      embed.addFields({ name: 'Reason', value: reason.substring(0, 1024) });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logMute error:', err);
  }
}

async function logUnmute(client, guild, user, moderator = null) {
  try {
    const channel = await ensureModlogsChannel(client, guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🔊 User Unmuted')
      .setColor('#22c55e')
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown', inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logUnmute error:', err);
  }
}

async function logWarn(client, guild, user, moderator = null, reason = null) {
  try {
    const channel = await ensureModlogsChannel(client, guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('⚠️ User Warned')
      .setColor('#eab308')
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown', inline: true }
      )
      .setTimestamp();

    if (reason) {
      embed.addFields({ name: 'Reason', value: reason.substring(0, 1024) });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logWarn error:', err);
  }
}

async function logBulkDelete(client, guild, channel, count, moderator = null) {
  try {
    const logsChannel = await ensureModlogsChannel(client, guild);
    if (!logsChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Bulk Message Delete')
      .setColor('#ef4444')
      .addFields(
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Count', value: `${count} messages`, inline: true },
        { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown', inline: true }
      )
      .setTimestamp();

    await logsChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logBulkDelete error:', err);
  }
}

// ---------------- Init function ----------------
function initModlogs(client) {
  if (!client) {
    console.error('[Modlogs] client required');
    return false;
  }
  if (!client.automodDB) {
    console.error('[Modlogs] Missing client.automodDB. Init aborted.');
    return false;
  }

  // Create table if not exists
  try {
    client.automodDB.prepare(`
      CREATE TABLE IF NOT EXISTS modlogs_channel (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL
      )
    `).run();
  } catch (err) {
    console.error('[Modlogs] Table creation failed:', err);
  }

  // Auto-create channels immediately (bot is already ready when this is called)
  console.log('[Modlogs] Auto-creating mod-logs channels...');
  (async () => {
    for (const guild of client.guilds.cache.values()) {
      await ensureModlogsChannel(client, guild);
    }
  })();

  // Message delete
  client.on('messageDelete', async (message) => {
    await logMessageDelete(client, message);
  });

  // Message edit
  client.on('messageUpdate', async (oldMessage, newMessage) => {
    await logMessageUpdate(client, oldMessage, newMessage);
  });

  // Bulk delete
  client.on('messageDeleteBulk', async (messages) => {
    const firstMessage = messages.first();
    if (!firstMessage?.guild) return;
    await logBulkDelete(client, firstMessage.guild, firstMessage.channel, messages.size);
  });

  // Ban
  client.on('guildBanAdd', async (ban) => {
    try {
      // Try to fetch audit log to get moderator
      const auditLogs = await ban.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 1
      });
      const banLog = auditLogs.entries.first();
      const moderator = banLog?.executor;
      const reason = banLog?.reason;
      
      await logBan(client, ban.guild, ban.user, moderator, reason);
    } catch (err) {
      await logBan(client, ban.guild, ban.user);
    }
  });

  // Unban
  client.on('guildBanRemove', async (ban) => {
    try {
      const auditLogs = await ban.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanRemove,
        limit: 1
      });
      const unbanLog = auditLogs.entries.first();
      const moderator = unbanLog?.executor;
      
      await logUnban(client, ban.guild, ban.user, moderator);
    } catch (err) {
      await logUnban(client, ban.guild, ban.user);
    }
  });

  // Member kick
  client.on('guildMemberRemove', async (member) => {
    try {
      // Wait a bit for audit log to populate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const auditLogs = await member.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberKick,
        limit: 1
      });
      const kickLog = auditLogs.entries.first();
      
      // Check if this was a kick (not just a leave)
      if (kickLog && kickLog.target.id === member.id && Date.now() - kickLog.createdTimestamp < 5000) {
        await logKick(client, member.guild, member.user, kickLog.executor, kickLog.reason);
      }
    } catch (err) {
      // Ignore - probably just a user leaving
    }
  });

  // Member timeout (mute)
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      // Check if timeout was added or removed
      const wasTimedOut = oldMember.communicationDisabledUntilTimestamp;
      const isTimedOut = newMember.communicationDisabledUntilTimestamp;
      
      if (!wasTimedOut && isTimedOut) {
        // User was muted
        const auditLogs = await newMember.guild.fetchAuditLogs({
          type: AuditLogEvent.MemberUpdate,
          limit: 1
        });
        const timeoutLog = auditLogs.entries.first();
        
        const duration = isTimedOut ? `<t:${Math.floor(isTimedOut / 1000)}:R>` : 'Unknown';
        await logMute(client, newMember.guild, newMember.user, timeoutLog?.executor, timeoutLog?.reason, duration);
      } else if (wasTimedOut && !isTimedOut) {
        // User was unmuted
        const auditLogs = await newMember.guild.fetchAuditLogs({
          type: AuditLogEvent.MemberUpdate,
          limit: 1
        });
        const timeoutLog = auditLogs.entries.first();
        
        await logUnmute(client, newMember.guild, newMember.user, timeoutLog?.executor);
      }
    } catch (err) {
      console.error('[Modlogs] guildMemberUpdate error:', err);
    }
  });

  // Attach API to client
  client.modlogs = {
    logBan: (guild, user, moderator, reason) => logBan(client, guild, user, moderator, reason),
    logUnban: (guild, user, moderator) => logUnban(client, guild, user, moderator),
    logKick: (guild, user, moderator, reason) => logKick(client, guild, user, moderator, reason),
    logMute: (guild, user, moderator, reason, duration) => logMute(client, guild, user, moderator, reason, duration),
    logUnmute: (guild, user, moderator) => logUnmute(client, guild, user, moderator),
    logWarn: (guild, user, moderator, reason) => logWarn(client, guild, user, moderator, reason),
    logBulkDelete: (guild, channel, count, moderator) => logBulkDelete(client, guild, channel, count, moderator),
    ensureChannel: (guild) => ensureModlogsChannel(client, guild)
  };

  console.log('[Modlogs] initialized and bound to client.modlogs');
  return true;
}

module.exports = { initModlogs };