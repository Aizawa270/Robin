// handlers/modlogsHandler.js
const {
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  AuditLogEvent
} = require('discord.js');

const CATEGORY_ID = '1431692511289802872';

// ============ DATABASE FUNCTIONS ============
function getModlogsChannel(client, guildId) {
  try {
    const row = client.automodDB.prepare('SELECT channel_id FROM modlogs_channel WHERE guild_id = ?').get(guildId);
    return row?.channel_id || null;
  } catch (err) {
    console.error('[Modlogs] DB read error:', err);
    return null;
  }
}

function setModlogsChannel(client, guildId, channelId) {
  try {
    client.automodDB.prepare('INSERT OR REPLACE INTO modlogs_channel (guild_id, channel_id) VALUES (?, ?)').run(guildId, channelId);
    return true;
  } catch (err) {
    console.error('[Modlogs] DB write error:', err);
    return false;
  }
}

// ============ CHANNEL CREATION ============
async function createModlogsChannel(client, guild) {
  try {
    console.log(`[Modlogs] Creating mod-logs channel for: ${guild.name}`);

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
    console.log(`[Modlogs] ✅ Created channel ${channel.id} for ${guild.name}`);

    // Send initialization message
    const initEmbed = new EmbedBuilder()
      .setColor('#22c55e')
      .setTitle('📋 Modlogs System Initialized')
      .setDescription('This channel will log all moderation activities.')
      .setTimestamp();

    await channel.send({ embeds: [initEmbed] });

    return channel;
  } catch (err) {
    console.error(`[Modlogs] Failed to create channel for ${guild.name}:`, err);
    return null;
  }
}

async function getOrCreateChannel(client, guild) {
  try {
    // Check database first
    const channelId = getModlogsChannel(client, guild.id);

    if (channelId) {
      // Try to fetch existing channel
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel) {
        return channel;
      } else {
        console.log(`[Modlogs] Channel ${channelId} not found for ${guild.name}, creating new one`);
      }
    }

    // Create new channel
    return await createModlogsChannel(client, guild);
  } catch (err) {
    console.error('[Modlogs] getOrCreateChannel error:', err);
    return null;
  }
}

// ============ LOGGING FUNCTIONS ============

async function logMessageDelete(client, message) {
  try {
    if (!message.guild || message.author?.bot) return;

    const channel = await getOrCreateChannel(client, message.guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Message Deleted')
      .setColor('#ef4444')
      .setThumbnail(message.author?.displayAvatarURL({ size: 128 }) || null)
      .addFields(
        { name: '👤 Author', value: `${message.author?.tag || 'Unknown'}\n\`${message.author?.id || 'Unknown'}\``, inline: true },
        { name: '📍 Channel', value: `${message.channel}\n\`${message.channel.id}\``, inline: true },
        { name: '🆔 Message ID', value: `\`${message.id}\``, inline: true }
      )
      .setTimestamp();

    if (message.content) {
      embed.addFields({ name: '💬 Content', value: message.content.substring(0, 1024) || '*No text content*' });
    }

    if (message.attachments.size > 0) {
      const attachmentList = message.attachments.map(a => `[${a.name}](${a.url})`).join('\n');
      embed.addFields({ name: '📎 Attachments', value: attachmentList.substring(0, 1024) });

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
    if (oldMessage.content === newMessage.content) return;

    const channel = await getOrCreateChannel(client, newMessage.guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('✏️ Message Edited')
      .setColor('#f59e0b')
      .setThumbnail(newMessage.author?.displayAvatarURL({ size: 128 }) || null)
      .addFields(
        { name: '👤 Author', value: `${newMessage.author?.tag || 'Unknown'}\n\`${newMessage.author?.id || 'Unknown'}\``, inline: true },
        { name: '📍 Channel', value: `${newMessage.channel}\n\`${newMessage.channel.id}\``, inline: true },
        { name: '🆔 Message ID', value: `\`${newMessage.id}\``, inline: true },
        { name: '📝 Before', value: oldMessage.content?.substring(0, 1024) || '*No content*' },
        { name: '📝 After', value: newMessage.content?.substring(0, 1024) || '*No content*' }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logMessageUpdate error:', err);
  }
}

async function logBulkDelete(client, messages) {
  try {
    const firstMessage = messages.first();
    if (!firstMessage?.guild) return;

    const channel = await getOrCreateChannel(client, firstMessage.guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Bulk Message Delete')
      .setColor('#ef4444')
      .addFields(
        { name: '📍 Channel', value: `${firstMessage.channel}\n\`${firstMessage.channel.id}\``, inline: true },
        { name: '🔢 Count', value: `**${messages.size}** messages`, inline: true },
        { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logBulkDelete error:', err);
  }
}

async function logBan(client, ban) {
  try {
    const channel = await getOrCreateChannel(client, ban.guild);
    if (!channel) return;

    // Try to get moderator from audit logs
    let moderator = null;
    let reason = ban.reason || 'No reason provided';

    try {
      const auditLogs = await ban.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 1
      });
      const banLog = auditLogs.entries.first();
      if (banLog && banLog.target.id === ban.user.id && Date.now() - banLog.createdTimestamp < 5000) {
        moderator = banLog.executor;
        reason = banLog.reason || reason;
      }
    } catch (err) {
      console.error('[Modlogs] Failed to fetch ban audit log:', err);
    }

    const embed = new EmbedBuilder()
      .setTitle('🔨 User Banned')
      .setColor('#dc2626')
      .setThumbnail(ban.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: '👤 User', value: `${ban.user.tag}\n\`${ban.user.id}\``, inline: true },
        { name: '👮 Moderator', value: moderator ? `${moderator.tag}\n\`${moderator.id}\`` : 'Unknown', inline: true },
        { name: '📋 Reason', value: reason.substring(0, 1024) }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logBan error:', err);
  }
}

async function logUnban(client, ban) {
  try {
    const channel = await getOrCreateChannel(client, ban.guild);
    if (!channel) return;

    let moderator = null;

    try {
      const auditLogs = await ban.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanRemove,
        limit: 1
      });
      const unbanLog = auditLogs.entries.first();
      if (unbanLog && unbanLog.target.id === ban.user.id && Date.now() - unbanLog.createdTimestamp < 5000) {
        moderator = unbanLog.executor;
      }
    } catch (err) {
      console.error('[Modlogs] Failed to fetch unban audit log:', err);
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ User Unbanned')
      .setColor('#22c55e')
      .setThumbnail(ban.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: '👤 User', value: `${ban.user.tag}\n\`${ban.user.id}\``, inline: true },
        { name: '👮 Moderator', value: moderator ? `${moderator.tag}\n\`${moderator.id}\`` : 'Unknown', inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logUnban error:', err);
  }
}

async function logKick(client, member, moderator = null, reason = null) {
  try {
    const channel = await getOrCreateChannel(client, member.guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('👢 User Kicked')
      .setColor('#f97316')
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: '👤 User', value: `${member.user.tag}\n\`${member.user.id}\``, inline: true },
        { name: '👮 Moderator', value: moderator ? `${moderator.tag}\n\`${moderator.id}\`` : 'Unknown', inline: true },
        { name: '📋 Reason', value: (reason || 'No reason provided').substring(0, 1024) }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logKick error:', err);
  }
}

async function logTimeout(client, member, moderator = null, reason = null, until = null) {
  try {
    const channel = await getOrCreateChannel(client, member.guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🔇 User Timed Out')
      .setColor('#8b5cf6')
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: '👤 User', value: `${member.user.tag}\n\`${member.user.id}\``, inline: true },
        { name: '👮 Moderator', value: moderator ? `${moderator.tag}\n\`${moderator.id}\`` : 'Unknown', inline: true }
      );

    if (until) {
      embed.addFields({ name: '⏰ Until', value: `<t:${Math.floor(until / 1000)}:F>`, inline: true });
    }

    if (reason) {
      embed.addFields({ name: '📋 Reason', value: reason.substring(0, 1024) });
    }

    embed.setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logTimeout error:', err);
  }
}

async function logTimeoutRemove(client, member, moderator = null) {
  try {
    const channel = await getOrCreateChannel(client, member.guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🔊 Timeout Removed')
      .setColor('#22c55e')
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: '👤 User', value: `${member.user.tag}\n\`${member.user.id}\``, inline: true },
        { name: '👮 Moderator', value: moderator ? `${moderator.tag}\n\`${moderator.id}\`` : 'Unknown', inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logTimeoutRemove error:', err);
  }
}

async function logWarn(client, guild, user, moderator = null, reason = null) {
  try {
    const channel = await getOrCreateChannel(client, guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('⚠️ User Warned')
      .setColor('#eab308')
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: '👤 User', value: `${user.tag}\n\`${user.id}\``, inline: true },
        { name: '👮 Moderator', value: moderator ? `${moderator.tag}\n\`${moderator.id}\`` : 'Unknown', inline: true },
        { name: '📋 Reason', value: (reason || 'No reason provided').substring(0, 1024) }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Modlogs] logWarn error:', err);
  }
}

// ============ INITIALIZATION ============
function initModlogs(client) {
  console.log('[Modlogs] Initializing system...');

  if (!client || !client.automodDB) {
    console.error('[Modlogs] ❌ Missing client or automodDB - initialization aborted');
    return false;
  }

  // Create channels for all guilds after a delay (ensures bot is fully ready)
  setTimeout(async () => {
    console.log('[Modlogs] Creating mod-logs channels for all guilds...');
    for (const guild of client.guilds.cache.values()) {
      await getOrCreateChannel(client, guild);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between guilds
    }
    console.log('[Modlogs] ✅ Channel creation complete');
  }, 3000);

  // ============ EVENT LISTENERS ============

  // Message Delete
  client.on('messageDelete', async (message) => {
    await logMessageDelete(client, message);
  });

  // Message Edit
  client.on('messageUpdate', async (oldMessage, newMessage) => {
    await logMessageUpdate(client, oldMessage, newMessage);
  });

  // Bulk Delete
  client.on('messageDeleteBulk', async (messages) => {
    await logBulkDelete(client, messages);
  });

  // Ban
  client.on('guildBanAdd', async (ban) => {
    await logBan(client, ban);
  });

  // Unban
  client.on('guildBanRemove', async (ban) => {
    await logUnban(client, ban);
  });

  // Kick (detected via member remove)
  client.on('guildMemberRemove', async (member) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      const auditLogs = await member.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberKick,
        limit: 1
      });
      const kickLog = auditLogs.entries.first();

      if (kickLog && kickLog.target.id === member.id && Date.now() - kickLog.createdTimestamp < 5000) {
        await logKick(client, member, kickLog.executor, kickLog.reason);
      }
    } catch (err) {
      // Ignore - probably just a user leaving naturally
    }
  });

  // Timeout / Timeout Remove
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      const wasTimedOut = oldMember.communicationDisabledUntilTimestamp;
      const isTimedOut = newMember.communicationDisabledUntilTimestamp;

      if (!wasTimedOut && isTimedOut) {
        // Timeout added
        await new Promise(resolve => setTimeout(resolve, 500));

        let moderator = null;
        let reason = null;

        try {
          const auditLogs = await newMember.guild.fetchAuditLogs({
            type: AuditLogEvent.MemberUpdate,
            limit: 1
          });
          const timeoutLog = auditLogs.entries.first();
          if (timeoutLog && timeoutLog.target.id === newMember.id && Date.now() - timeoutLog.createdTimestamp < 5000) {
            moderator = timeoutLog.executor;
            reason = timeoutLog.reason;
          }
        } catch (err) {
          console.error('[Modlogs] Failed to fetch timeout audit log:', err);
        }

        await logTimeout(client, newMember, moderator, reason, isTimedOut);
      } else if (wasTimedOut && !isTimedOut) {
        // Timeout removed
        await new Promise(resolve => setTimeout(resolve, 500));

        let moderator = null;

        try {
          const auditLogs = await newMember.guild.fetchAuditLogs({
            type: AuditLogEvent.MemberUpdate,
            limit: 1
          });
          const timeoutLog = auditLogs.entries.first();
          if (timeoutLog && timeoutLog.target.id === newMember.id && Date.now() - timeoutLog.createdTimestamp < 5000) {
            moderator = timeoutLog.executor;
          }
        } catch (err) {
          console.error('[Modlogs] Failed to fetch timeout removal audit log:', err);
        }

        await logTimeoutRemove(client, newMember, moderator);
      }
    } catch (err) {
      console.error('[Modlogs] guildMemberUpdate error:', err);
    }
  });

  // ============ CLIENT API ============
  client.modlogs = {
    logWarn: (guild, user, moderator, reason) => logWarn(client, guild, user, moderator, reason),
    logKick: (member, moderator, reason) => logKick(client, member, moderator, reason),
    logTimeout: (member, moderator, reason, until) => logTimeout(client, member, moderator, reason, until),
    logTimeoutRemove: (member, moderator) => logTimeoutRemove(client, member, moderator),
    getChannel: (guild) => getOrCreateChannel(client, guild),
  };

  console.log('[Modlogs] ✅ System initialized successfully');
  return true;
}

module.exports = { initModlogs };
