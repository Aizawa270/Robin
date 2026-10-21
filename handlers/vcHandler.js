const {
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

const VC_COMMAND = require('../commands/utility/vc');

const AFK_TIME = 30 * 60 * 1000;
const RETRY_TIME = 60 * 1000;

const creatingUsers = new Set();

// ============================================================
// INITIALIZATION
// ============================================================

function ensureDB(client) {
  VC_COMMAND.initDB(client);

  if (!client.vcAFKTimers) {
    client.vcAFKTimers = new Map();
  }
}

function cancelAFKTimer(
  client,
  channelId
) {
  if (!client.vcAFKTimers) {
    client.vcAFKTimers = new Map();
  }

  const key = String(channelId);

  const timer = client.vcAFKTimers.get(key);

  if (timer) {
    clearTimeout(timer);
  }

  client.vcAFKTimers.delete(key);
}

// ============================================================
// AFK EXPIRY
// ============================================================

function setAFKExpiry(
  client,
  guildId,
  channelId,
  expiresAt
) {
  client.vcDB.prepare(`
    UPDATE vc_channels
    SET afk_expires_at = ?
    WHERE guild_id = ?
      AND channel_id = ?
  `).run(
    expiresAt,
    String(guildId),
    String(channelId)
  );
}

function scheduleAFKTimer(
  client,
  guild,
  channel,
  requestedExpiry = null
) {
  ensureDB(client);

  cancelAFKTimer(
    client,
    channel.id
  );

  const state = VC_COMMAND.getVCState(
    client,
    guild.id,
    channel.id
  );

  if (!state?.afk_enabled) {
    return;
  }

  const expiresAt =
    Number(
      requestedExpiry ||
      state.afk_expires_at ||
      0
    ) || (
      Date.now() + AFK_TIME
    );

  setAFKExpiry(
    client,
    guild.id,
    channel.id,
    expiresAt
  );

  const delay = Math.max(
    0,
    expiresAt - Date.now()
  );

  const timer = setTimeout(async () => {
    client.vcAFKTimers.delete(
      String(channel.id)
    );

    const currentState = VC_COMMAND.getVCState(
      client,
      guild.id,
      channel.id
    );

    if (!currentState?.afk_enabled) {
      return;
    }

    let currentChannel =
      guild.channels.cache.get(channel.id);

    if (!currentChannel) {
      currentChannel = await guild.channels
        .fetch(channel.id)
        .catch(() => null);
    }

    if (!currentChannel) {
      VC_COMMAND.deleteChannelState(
        client,
        guild.id,
        channel.id
      );

      return;
    }

    if (
      currentChannel.type !== ChannelType.GuildVoice
    ) {
      VC_COMMAND.deleteChannelState(
        client,
        guild.id,
        channel.id
      );

      return;
    }

    // Someone is still inside.
    if (currentChannel.members.size > 0) {
      setAFKExpiry(
        client,
        guild.id,
        channel.id,
        null
      );

      return;
    }

    try {
      await currentChannel.delete(
        'Personal VC AFK timeout'
      );

      VC_COMMAND.deleteChannelState(
        client,
        guild.id,
        channel.id
      );
    } catch (error) {
      console.error(
        `[VC] Could not delete expired AFK VC ${channel.id}:`,
        error
      );

      // Retry if Discord temporarily rejects deletion.
      const latest =
        guild.channels.cache.get(channel.id);

      if (
        latest &&
        VC_COMMAND.getVCState(
          client,
          guild.id,
          channel.id
        )?.afk_enabled
      ) {
        scheduleAFKTimer(
          client,
          guild,
          latest,
          Date.now() + RETRY_TIME
        );
      }
    }
  }, delay);

  timer.unref?.();

  client.vcAFKTimers.set(
    String(channel.id),
    timer
  );
}

// ============================================================
// CREATE PERSONAL VOICE CHANNEL
// ============================================================

async function createPersonalVC(
  client,
  member
) {
  const guild = member.guild;

  const settings = VC_COMMAND.getGuildSettings(
    client,
    guild.id
  );

  if (!settings?.join_channel_id) {
    return null;
  }

  // Find the configured category.
  let category = null;

  if (settings.category_id) {
    category =
      guild.channels.cache.get(settings.category_id) ||
      await guild.channels
        .fetch(settings.category_id)
        .catch(() => null);

    if (
      category?.type !== ChannelType.GuildCategory
    ) {
      category = null;
    }
  }

  // If the stored category no longer exists,
  // try using the trigger channel's category.
  if (!category) {
    const trigger =
      guild.channels.cache.get(settings.join_channel_id) ||
      await guild.channels
        .fetch(settings.join_channel_id)
        .catch(() => null);

    if (
      trigger?.type === ChannelType.GuildVoice &&
      trigger.parent?.type === ChannelType.GuildCategory
    ) {
      category = trigger.parent;
    }
  }

  const cleanUsername = String(
    member.user.username || 'User'
  )
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 85) || 'User';

  const overwrites = [
    {
      id: guild.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
      ],
    },

    {
      id: member.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.Stream,
        PermissionsBitField.Flags.UseVAD,
      ],
    },
  ];

  const channel = await guild.channels.create({
    name: `${cleanUsername}'s VC`.slice(0, 100),

    type: ChannelType.GuildVoice,

    parent: category?.id || null,

    permissionOverwrites: overwrites,

    reason:
      `Join-to-Create personal VC for ${member.user.tag}`,
  });

  // Register the new channel in SQLite.
  VC_COMMAND.registerChannel(
    client,
    guild.id,
    channel.id,
    member.id
  );

  // Move the member into the new VC.
  try {
    await member.voice.setChannel(
      channel,
      'Join-to-Create personal VC'
    );
  } catch (error) {
    console.error(
      `[VC] Could not move ${member.user.tag} into their new VC:`,
      error
    );

    await channel.delete(
      'Could not move owner into their personal VC'
    ).catch(() => {});

    VC_COMMAND.deleteChannelState(
      client,
      guild.id,
      channel.id
    );

    return null;
  }

  console.log(
    `[VC] Created ${channel.name} for ${member.user.tag} in ${guild.name}`
  );

  return channel;
}

// ============================================================
// JOIN-TO-CREATE LOGIC
// ============================================================

async function handleJoinToCreate(
  client,
  member
) {
  const guild = member.guild;

  const settings = VC_COMMAND.getGuildSettings(
    client,
    guild.id
  );

  if (!settings?.join_channel_id) {
    return;
  }

  // Prevent duplicate channels when Discord fires multiple events.
  const lockKey = `${guild.id}:${member.id}`;

  if (creatingUsers.has(lockKey)) {
    return;
  }

  creatingUsers.add(lockKey);

  try {
    // Check whether the member already owns a personal VC.
    const existing = VC_COMMAND.getOwnerVC(
      client,
      guild.id,
      member.id
    );

    if (existing) {
      let existingChannel =
        guild.channels.cache.get(existing.channel_id);

      if (!existingChannel) {
        existingChannel = await guild.channels
          .fetch(existing.channel_id)
          .catch(() => null);
      }

      if (
        existingChannel?.type === ChannelType.GuildVoice
      ) {
        try {
          await member.voice.setChannel(
            existingChannel,
            'Return to existing personal VC'
          );

          return;
        } catch (error) {
          console.error(
            `[VC] Could not move ${member.user.tag} to their existing VC:`,
            error
          );
        }
      } else {
        VC_COMMAND.deleteChannelState(
          client,
          guild.id,
          existing.channel_id
        );
      }
    }

    // Create a new personal VC.
    await createPersonalVC(
      client,
      member
    );
  } catch (error) {
    console.error(
      `[VC] Join-to-Create failed for ${member.user.tag}:`,
      error
    );
  } finally {
    creatingUsers.delete(lockKey);
  }
}

// ============================================================
// VOICE STATE UPDATE
// ============================================================

async function handleVoiceStateUpdate(
  client,
  oldState,
  newState
) {
  ensureDB(client);

  const member =
    newState.member ||
    oldState.member;

  if (
    !member ||
    member.user?.bot
  ) {
    return;
  }

  const guild = member.guild;

  const actuallyChangedChannel =
    oldState.channelId !== newState.channelId;

  // ----------------------------------------------------------
  // JOIN TRIGGER CHANNEL
  // ----------------------------------------------------------

  const triggerId = VC_COMMAND.getJoinToCreateId(
    client,
    guild.id
  );

  if (
    actuallyChangedChannel &&
    newState.channelId &&
    triggerId &&
    newState.channelId === triggerId
  ) {
    await handleJoinToCreate(
      client,
      member
    );

    // Continue processing because moving the member
    // might have emptied their previous personal VC.
  }

  // ----------------------------------------------------------
  // MEMBER ENTERED A PERSONAL VC
  // ----------------------------------------------------------

  if (
    actuallyChangedChannel &&
    newState.channelId
  ) {
    const newVCState = VC_COMMAND.getVCState(
      client,
      guild.id,
      newState.channelId
    );

    if (newVCState?.afk_enabled) {
      // Cancel the AFK countdown while someone is inside.
      cancelAFKTimer(
        client,
        newState.channelId
      );

      setAFKExpiry(
        client,
        guild.id,
        newState.channelId,
        null
      );
    }
  }

  // ----------------------------------------------------------
  // CHECK THE CHANNEL THE MEMBER LEFT
  // ----------------------------------------------------------

  if (
    !actuallyChangedChannel ||
    !oldState.channelId
  ) {
    return;
  }

  const oldVCState = VC_COMMAND.getVCState(
    client,
    guild.id,
    oldState.channelId
  );

  if (!oldVCState) {
    return;
  }

  let oldChannel =
    guild.channels.cache.get(oldState.channelId);

  if (!oldChannel) {
    oldChannel = await guild.channels
      .fetch(oldState.channelId)
      .catch(() => null);
  }

  if (
    !oldChannel ||
    oldChannel.type !== ChannelType.GuildVoice
  ) {
    cancelAFKTimer(
      client,
      oldState.channelId
    );

    VC_COMMAND.deleteChannelState(
      client,
      guild.id,
      oldState.channelId
    );

    return;
  }

  // Someone else remains in the channel.
  if (oldChannel.members.size > 0) {
    return;
  }

  // ----------------------------------------------------------
  // AFK ENABLED: KEEP CHANNEL TEMPORARILY
  // ----------------------------------------------------------

  if (oldVCState.afk_enabled) {
    scheduleAFKTimer(
      client,
      guild,
      oldChannel,
      oldVCState.afk_expires_at
    );

    return;
  }

  // ----------------------------------------------------------
  // AFK DISABLED: DELETE EMPTY VC IMMEDIATELY
  // ----------------------------------------------------------

  cancelAFKTimer(
    client,
    oldChannel.id
  );

  try {
    await oldChannel.delete(
      'Personal VC became empty'
    );

    VC_COMMAND.deleteChannelState(
      client,
      guild.id,
      oldChannel.id
    );
  } catch (error) {
    console.error(
      `[VC] Could not delete empty personal VC ${oldChannel.id}:`,
      error
    );
  }
}

// ============================================================
// RECONCILE DATABASE AFTER RESTART
// ============================================================

async function reconcileVCsOnStartup(client) {
  ensureDB(client);

  for (
    const guild of client.guilds.cache.values()
  ) {
    const rows = client.vcDB.prepare(`
      SELECT
        channel_id,
        afk_enabled,
        afk_expires_at
      FROM vc_channels
      WHERE guild_id = ?
    `).all(guild.id);

    for (const row of rows) {
      let channel =
        guild.channels.cache.get(row.channel_id);

      if (!channel) {
        channel = await guild.channels
          .fetch(row.channel_id)
          .catch(() => null);
      }

      // Remove records for channels that no longer exist.
      if (
        !channel ||
        channel.type !== ChannelType.GuildVoice
      ) {
        cancelAFKTimer(
          client,
          row.channel_id
        );

        VC_COMMAND.deleteChannelState(
          client,
          guild.id,
          row.channel_id
        );

        continue;
      }

      if (!row.afk_enabled) {
        continue;
      }

      // If the channel has users, preserve AFK mode
      // and start the countdown when it becomes empty.
      if (channel.members.size > 0) {
        setAFKExpiry(
          client,
          guild.id,
          channel.id,
          null
        );

        continue;
      }

      const expiry =
        Number(row.afk_expires_at || 0) ||
        (Date.now() + AFK_TIME);

      scheduleAFKTimer(
        client,
        guild,
        channel,
        expiry
      );
    }
  }
}

// ============================================================
// SETUP VC HANDLER
// ============================================================

function setupVCHandler(client) {
  ensureDB(client);

  // Detect people joining or leaving voice channels.
  client.on(
    'voiceStateUpdate',
    (oldState, newState) => {
      handleVoiceStateUpdate(
        client,
        oldState,
        newState
      ).catch(error => {
        console.error(
          '[VC] Voice state handler failed:',
          error
        );
      });
    }
  );

  // Clean up database information when channels are deleted.
  client.on('channelDelete', channel => {
    try {
      cancelAFKTimer(
        client,
        channel.id
      );

      VC_COMMAND.deleteChannelState(
        client,
        channel.guild.id,
        channel.id
      );

      client.vcDB.prepare(`
        DELETE FROM vc_settings
        WHERE guild_id = ?
          AND join_channel_id = ?
      `).run(
        channel.guild.id,
        channel.id
      );
    } catch (error) {
      console.error(
        '[VC] Channel cleanup failed:',
        error
      );
    }
  });

  // Restore persistent VC state after the bot starts.
  client.once('ready', () => {
    reconcileVCsOnStartup(client).catch(error => {
      console.error(
        '[VC] Startup reconciliation failed:',
        error
      );
    });
  });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  setupVCHandler,
  createPersonalVC,
  handleVoiceStateUpdate,
  reconcileVCsOnStartup,
};