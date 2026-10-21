const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const {
  ChannelType,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

const {
  resolveUser,
  resolveMember: resolveUniversalMember,
} = require('../../handlers/universalHelper');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'vc.sqlite');

const DEFAULT_COLOR = '#5b0000';

// ============================================================
// DATABASE
// ============================================================

function ensureDB(client) {
  if (client.vcDB && client.vcDB.open) {
    return client.vcDB;
  }

  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });

  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS vc_channels (
      guild_id TEXT NOT NULL,
      channel_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      afk_enabled INTEGER NOT NULL DEFAULT 0,
      afk_expires_at INTEGER DEFAULT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vc_channels_owner
      ON vc_channels (guild_id, owner_id);

    CREATE TABLE IF NOT EXISTS vc_muted_members (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, channel_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS vc_settings (
      guild_id TEXT PRIMARY KEY,
      join_channel_id TEXT NOT NULL,
      category_id TEXT DEFAULT NULL,
      updated_at INTEGER NOT NULL
        DEFAULT (strftime('%s','now') * 1000)
    );
  `);

  client.vcDB = db;

  if (!client.vcAFKTimers) {
    client.vcAFKTimers = new Map();
  }

  return db;
}

// ============================================================
// EXACT COMMAND CHECK
//
// Prevents this command from responding to ordinary messages
// such as "bc", "vc hi", or messages containing "vc".
//
// Only an exact prefixed command token is accepted.
// ============================================================

function isExactVCCommand(client, message) {
  const prefix = String(
    message.prefix ||
    client.getPrefix?.(message.guild?.id) ||
    '$'
  );

  if (!prefix) {
    return false;
  }

  const firstToken = String(
    message.content || ''
  )
    .trim()
    .split(/\s+/)[0] || '';

  if (!firstToken.startsWith(prefix)) {
    return false;
  }

  const invokedName = firstToken
    .slice(prefix.length)
    .toLowerCase();

  // These are the explicitly supported command names.
  // Matching is exact, not a substring match.
  return [
    'vc',
    'voicechannel',
    'vchelp',
  ].includes(invokedName);
}

// ============================================================
// EMBEDS
// ============================================================

function createReplyEmbed(
  title,
  description,
  color = DEFAULT_COLOR
) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

// ============================================================
// PER-SERVER CONFIGURATION
// ============================================================

function getGuildSettings(client, guildId) {
  const db = ensureDB(client);

  return db.prepare(`
    SELECT
      guild_id,
      join_channel_id,
      category_id,
      updated_at
    FROM vc_settings
    WHERE guild_id = ?
  `).get(String(guildId)) || null;
}

function getJoinToCreateId(client, guildId) {
  if (!guildId) {
    return null;
  }

  return (
    getGuildSettings(client, guildId)?.join_channel_id ||
    null
  );
}

function setGuildSettings(
  client,
  guildId,
  joinChannelId,
  categoryId = null
) {
  const db = ensureDB(client);

  db.prepare(`
    INSERT INTO vc_settings (
      guild_id,
      join_channel_id,
      category_id,
      updated_at
    )
    VALUES (?, ?, ?, ?)

    ON CONFLICT(guild_id) DO UPDATE SET
      join_channel_id = excluded.join_channel_id,
      category_id = excluded.category_id,
      updated_at = excluded.updated_at
  `).run(
    String(guildId),
    String(joinChannelId),
    categoryId ? String(categoryId) : null,
    Date.now()
  );
}

function clearGuildSettings(client, guildId) {
  ensureDB(client).prepare(`
    DELETE FROM vc_settings
    WHERE guild_id = ?
  `).run(String(guildId));
}

// ============================================================
// PERSONAL VC DATABASE HELPERS
// ============================================================

function getVCState(
  client,
  guildId,
  channelId
) {
  return ensureDB(client).prepare(`
    SELECT *
    FROM vc_channels
    WHERE guild_id = ?
      AND channel_id = ?
  `).get(
    String(guildId),
    String(channelId)
  ) || null;
}

function getOwnerVC(
  client,
  guildId,
  ownerId
) {
  return ensureDB(client).prepare(`
    SELECT *
    FROM vc_channels
    WHERE guild_id = ?
      AND owner_id = ?
    ORDER BY rowid DESC
    LIMIT 1
  `).get(
    String(guildId),
    String(ownerId)
  ) || null;
}

function registerChannel(
  client,
  guildId,
  channelId,
  ownerId
) {
  ensureDB(client).prepare(`
    INSERT INTO vc_channels (
      guild_id,
      channel_id,
      owner_id,
      afk_enabled,
      afk_expires_at
    )
    VALUES (?, ?, ?, 0, NULL)

    ON CONFLICT(channel_id) DO UPDATE SET
      guild_id = excluded.guild_id,
      owner_id = excluded.owner_id,
      afk_enabled = 0,
      afk_expires_at = NULL
  `).run(
    String(guildId),
    String(channelId),
    String(ownerId)
  );
}

function deleteChannelState(
  client,
  guildId,
  channelId
) {
  const db = ensureDB(client);

  db.prepare(`
    DELETE FROM vc_channels
    WHERE guild_id = ?
      AND channel_id = ?
  `).run(
    String(guildId),
    String(channelId)
  );

  db.prepare(`
    DELETE FROM vc_muted_members
    WHERE guild_id = ?
      AND channel_id = ?
  `).run(
    String(guildId),
    String(channelId)
  );
}

// ============================================================
// TRACKING VC SERVER MUTES
// ============================================================

function getTrackedMuted(
  client,
  guildId,
  channelId
) {
  return ensureDB(client).prepare(`
    SELECT user_id
    FROM vc_muted_members
    WHERE guild_id = ?
      AND channel_id = ?
  `).all(
    String(guildId),
    String(channelId)
  );
}

function addTrackedMute(
  client,
  guildId,
  channelId,
  userId
) {
  ensureDB(client).prepare(`
    INSERT OR IGNORE INTO vc_muted_members (
      guild_id,
      channel_id,
      user_id
    )
    VALUES (?, ?, ?)
  `).run(
    String(guildId),
    String(channelId),
    String(userId)
  );
}

function removeTrackedMute(
  client,
  guildId,
  channelId,
  userId
) {
  ensureDB(client).prepare(`
    DELETE FROM vc_muted_members
    WHERE guild_id = ?
      AND channel_id = ?
      AND user_id = ?
  `).run(
    String(guildId),
    String(channelId),
    String(userId)
  );
}

function clearTrackedMutes(
  client,
  guildId,
  channelId
) {
  ensureDB(client).prepare(`
    DELETE FROM vc_muted_members
    WHERE guild_id = ?
      AND channel_id = ?
  `).run(
    String(guildId),
    String(channelId)
  );
}

// ============================================================
// VC UTILITIES
// ============================================================

function getCurrentVC(message) {
  const channel = message.member?.voice?.channel;

  if (
    !channel ||
    channel.type !== ChannelType.GuildVoice
  ) {
    return null;
  }

  return channel;
}

function cancelAFKTimer(client, channelId) {
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
// OWNER CHECK
// ============================================================

async function ownerOnly(
  client,
  message,
  channel
) {
  if (!channel) {
    await message.reply({
      embeds: [
        createReplyEmbed(
          'VC Required',
          'Join your personal voice channel before using this command.'
        ),
      ],
    }).catch(() => {});

    return false;
  }

  const state = getVCState(
    client,
    message.guild.id,
    channel.id
  );

  if (
    !state ||
    state.owner_id !== message.author.id
  ) {
    await message.reply({
      embeds: [
        createReplyEmbed(
          'Access Denied',
          'Only the owner of a Vanessa personal voice channel can use this command.',
          '#ef4444'
        ),
      ],
    }).catch(() => {});

    return false;
  }

  return true;
}

// ============================================================
// CHANNEL ID PARSER
// ============================================================

function parseChannelId(raw) {
  if (!raw) {
    return null;
  }

  const text = String(raw).trim();

  const mention = text.match(
    /^<#(\d{15,22})>$/
  );

  if (mention) {
    return mention[1];
  }

  if (/^\d{15,22}$/.test(text)) {
    return text;
  }

  return null;
}

// ============================================================
// UNIVERSAL VC MEMBER RESOLVER
//
// Supports user mentions, user IDs, and names supported by
// handlers/universalHelper.js.
//
// Used by both "permit" and "kick".
// ============================================================

async function resolveVCMember(
  client,
  message,
  args,
  argumentIndex = 1
) {
  // Prefer an explicit member mention.
  const mentioned = message.mentions.members.first();

  if (mentioned) {
    return mentioned;
  }

  const targetInput = args
    .slice(argumentIndex)
    .join(' ')
    .trim();

  if (!targetInput) {
    return null;
  }

  // First try the universal user resolver.
  try {
    const user = await resolveUser(
      client,
      message,
      targetInput
    );

    if (user) {
      const member =
        message.guild.members.cache.get(user.id) ||
        await message.guild.members
          .fetch(user.id)
          .catch(() => null);

      if (member) {
        return member;
      }
    }
  } catch (error) {
    console.error(
      '[VC] Universal user resolution failed:',
      error
    );
  }

  // Fallback to the universal guild-member resolver.
  try {
    const member = await resolveUniversalMember(
      client,
      message,
      targetInput
    );

    if (member) {
      return member;
    }
  } catch (error) {
    console.error(
      '[VC] Universal member resolution failed:',
      error
    );
  }

  return null;
}

// ============================================================
// VC SETUP COMMAND
//
// Examples:
//
// $vc setup #create-vc
// $vc setup
// $vc setup off
//
// Each guild has its own configuration.
// ============================================================

async function handleSetup(
  client,
  message,
  args
) {
  const guild = message.guild;

  const rawTarget =
    args[1] ||
    message.mentions.channels.first()?.id;

  const lowered = String(
    rawTarget || ''
  ).toLowerCase();

  // ----------------------------------------------------------
  // DISABLE JOIN-TO-CREATE
  // ----------------------------------------------------------

  if (
    lowered === 'off' ||
    lowered === 'disable' ||
    lowered === 'remove'
  ) {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageChannels
      )
    ) {
      return message.reply({
        embeds: [
          createReplyEmbed(
            'Permission Required',
            'You need **Manage Channels** to configure Join-to-Create.',
            '#ef4444'
          ),
        ],
      });
    }

    clearGuildSettings(
      client,
      guild.id
    );

    return message.reply({
      embeds: [
        createReplyEmbed(
          'VC Setup Removed',
          'Join-to-Create has been disabled for this server. Existing personal VCs will continue to work until they are deleted.'
        ),
      ],
    });
  }

  const existing = getGuildSettings(
    client,
    guild.id
  );

  // ----------------------------------------------------------
  // VIEW CURRENT CONFIGURATION
  // ----------------------------------------------------------

  if (!rawTarget) {
    if (!existing) {
      return message.reply({
        embeds: [
          createReplyEmbed(
            'VC Setup',
            `Use \`${client.getPrefix(guild.id)}vc setup #voice-channel\` to choose this server's Join-to-Create voice channel.`
          ),
        ],
      });
    }

    return message.reply({
      embeds: [
        createReplyEmbed(
          'VC Setup',
          `Join-to-Create is currently set to <#${existing.join_channel_id}>.\n` +
          `New personal VCs will be created ${
            existing.category_id
              ? `inside <#${existing.category_id}>`
              : 'without a category'
          }.\n\n` +
          `Use \`${client.getPrefix(guild.id)}vc setup #voice-channel\` to change it, or \`${client.getPrefix(guild.id)}vc setup off\` to disable it.`
        ),
      ],
    });
  }

  // ----------------------------------------------------------
  // PERMISSION CHECK
  // ----------------------------------------------------------

  if (
    !message.member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )
  ) {
    return message.reply({
      embeds: [
        createReplyEmbed(
          'Permission Required',
          'You need **Manage Channels** to configure Join-to-Create.',
          '#ef4444'
        ),
      ],
    });
  }

  // ----------------------------------------------------------
  // RESOLVE VOICE CHANNEL
  // ----------------------------------------------------------

  const channelMention =
    message.mentions.channels.first();

  const channelId =
    channelMention?.id ||
    parseChannelId(rawTarget);

  if (!channelId) {
    return message.reply({
      embeds: [
        createReplyEmbed(
          'Invalid Channel',
          `Mention a voice channel or provide its ID.\nExample: \`${client.getPrefix(guild.id)}vc setup #join-to-create\``,
          '#f59e0b'
        ),
      ],
    });
  }

  const channel =
    guild.channels.cache.get(channelId) ||
    await guild.channels
      .fetch(channelId)
      .catch(() => null);

  if (
    !channel ||
    channel.guildId !== guild.id ||
    channel.type !== ChannelType.GuildVoice
  ) {
    return message.reply({
      embeds: [
        createReplyEmbed(
          'Invalid Voice Channel',
          'That channel was not found in this server or is not a standard voice channel. Select a voice channel, not a text or stage channel.',
          '#f59e0b'
        ),
      ],
    });
  }

  // Save the trigger channel and its current category.
  setGuildSettings(
    client,
    guild.id,
    channel.id,
    channel.parentId || null
  );

  return message.reply({
    embeds: [
      createReplyEmbed(
        'VC Setup Complete',
        `Join-to-Create is now set to ${channel}.\n\n` +
        'When a member joins it, Vanessa will create a personal voice channel and move them into it. ' +
        'Each Discord server has its own saved setup. ' +
        `${
          channel.parentId
            ? `New channels will be created under <#${channel.parentId}>.`
            : 'New channels will be created without a category.'
        }`
      ),
    ],
  });
}

// ============================================================
// MAIN COMMAND
// ============================================================

module.exports = {
  name: 'vc',

  description: 'Personal voice channel setup and management.',

  category: 'utility',

  usage:
    'vc setup #channel | vc <name/lock/unlock/permit/kick/limit/reset/silence/unsilence/ghost/afk>',

  aliases: [
    'voicechannel',
    'vchelp',
  ],

  async execute(client, message, args) {
    // --------------------------------------------------------
    // STRICT COMMAND GUARD
    //
    // Prevents this command from producing embeds when the
    // dispatcher accidentally matches ordinary message text.
    // --------------------------------------------------------

    if (
      !message.guild ||
      !message.member ||
      !isExactVCCommand(client, message)
    ) {
      return;
    }

    ensureDB(client);

    const prefix = String(
      message.prefix ||
      client.getPrefix?.(message.guild.id) ||
      '$'
    );

    const subcommand = String(
      args[0] || ''
    ).toLowerCase();

    const firstToken = String(
      message.content || ''
    )
      .trim()
      .split(/\s+/)[0] || '';

    const invokedName = firstToken
      .slice(prefix.length)
      .toLowerCase();

    // --------------------------------------------------------
    // HELP
    // --------------------------------------------------------

    if (
      subcommand === 'help' ||
      subcommand === 'vchelp' ||
      invokedName === 'vchelp'
    ) {
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_COLOR)
        .setTitle('Voice Channel System')
        .setDescription(
          'Configure Join-to-Create once per server, then manage your own personal voice channel.'
        )
        .addFields(
          {
            name: 'Server Setup (Manage Channels)',

            value:
              `\`${prefix}vc setup #channel\` — Set the Join-to-Create voice channel.\n` +
              `\`${prefix}vc setup\` — View the current setup.\n` +
              `\`${prefix}vc setup off\` — Disable Join-to-Create.`,
          },
          {
            name: 'Channel',

            value:
              `\`${prefix}vc name <name>\` — Rename your VC.\n` +
              `\`${prefix}vc limit <0-99>\` — Set the user limit.\n` +
              `\`${prefix}vc reset\` — Reset custom VC settings.`,
          },
          {
            name: 'Access',

            value:
              `\`${prefix}vc lock\` / \`${prefix}vc unlock\` — Close or reopen your VC.\n` +
              `\`${prefix}vc permit @user\` — Allow a member into your VC.\n` +
              `\`${prefix}vc kick @user\` — Remove a member from your VC.`,
          },
          {
            name: 'Controls',

            value:
              `\`${prefix}vc silence\` / \`${prefix}vc unsilence\` — Manage Vanessa-applied server mutes.\n` +
              `\`${prefix}vc ghost\` — Toggle VC visibility.\n` +
              `\`${prefix}vc afk\` — Keep your VC for 30 minutes after it becomes empty.`,
          }
        )
        .setFooter({
          text: 'Personal VC commands can only be used by that VC’s owner.',
        })
        .setTimestamp();

      return message.reply({
        embeds: [embed],
      });
    }

    // --------------------------------------------------------
    // SETUP
    // --------------------------------------------------------

    if (subcommand === 'setup') {
      return handleSetup(
        client,
        message,
        args
      );
    }

    // --------------------------------------------------------
    // EMPTY COMMAND
    // --------------------------------------------------------

    if (!subcommand) {
      return message.reply({
        embeds: [
          createReplyEmbed(
            'VC Help',
            `Use \`${prefix}vchelp\` to see all voice channel commands. Server administrators can use \`${prefix}vc setup #channel\` to configure Join-to-Create.`
          ),
        ],
      });
    }

    // --------------------------------------------------------
    // FIND THE PERSONAL VC
    // --------------------------------------------------------

    const channel = getCurrentVC(message);

    if (!channel) {
      return message.reply({
        embeds: [
          createReplyEmbed(
            'VC Required',
            'Join your personal voice channel before using this command.'
          ),
        ],
      });
    }

    if (
      !await ownerOnly(
        client,
        message,
        channel
      )
    ) {
      return;
    }

    const guildId = message.guild.id;
    const channelId = channel.id;

    const reason =
      `Personal VC command used by ${message.author.tag}`;

    // --------------------------------------------------------
    // NAME
    // --------------------------------------------------------

    if (subcommand === 'name') {
      const newName = args
        .slice(1)
        .join(' ')
        .trim();

      if (!newName) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'Invalid Name',
              `Usage: \`${prefix}vc name <name>\``,
              '#f59e0b'
            ),
          ],
        });
      }

      if (newName.length > 100) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'Invalid Name',
              'Voice channel names cannot be longer than 100 characters.',
              '#f59e0b'
            ),
          ],
        });
      }

      try {
        await channel.setName(
          newName,
          reason
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'VC Renamed',
              `Your voice channel is now named **${newName}**.`
            ),
          ],
        });
      } catch (error) {
        console.error(
          '[VC] Rename failed:',
          error
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'Action Failed',
              'I could not rename the voice channel. Check Vanessa’s Manage Channels permission and role hierarchy.',
              '#ef4444'
            ),
          ],
        });
      }
    }

    // --------------------------------------------------------
    // LOCK / UNLOCK
    // --------------------------------------------------------

    if (
      subcommand === 'lock' ||
      subcommand === 'unlock'
    ) {
      const locking = subcommand === 'lock';

      try {
        await channel.permissionOverwrites.edit(
          guildId,
          {
            Connect: locking ? false : true,
          },
          {
            reason:
              `${locking ? 'VC locked' : 'VC unlocked'} by ${message.author.tag}`,
          }
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              locking ? 'VC Locked' : 'VC Unlocked',

              locking
                ? 'Your voice channel is locked. Members who already have access may remain inside.'
                : 'Your voice channel is open again.'
            ),
          ],
        });
      } catch (error) {
        console.error(
          `[VC] ${subcommand} failed:`,
          error
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'Action Failed',
              'I could not change the channel access. Check Vanessa’s Manage Channels permission.',
              '#ef4444'
            ),
          ],
        });
      }
    }

    // --------------------------------------------------------
    // PERMIT
    // --------------------------------------------------------

    if (subcommand === 'permit') {
      const target = await resolveVCMember(
        client,
        message,
        args,
        1
      );

      if (!target) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'User Not Found',
              'Mention a server member, provide their ID, or enter a username supported by the universal user resolver.',
              '#f59e0b'
            ),
          ],
        });
      }

      if (target.id === message.author.id) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'Invalid User',
              'You already own this voice channel.'
            ),
          ],
        });
      }

      try {
        await channel.permissionOverwrites.edit(
          target.id,
          {
            ViewChannel: true,
            Connect: true,
          },
          {
            reason:
              `VC access granted by ${message.author.tag}`,
          }
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'User Permitted',
              `${target.user} can now view and join your voice channel.`
            ),
          ],
        });
      } catch (error) {
        console.error(
          '[VC] Permit failed:',
          error
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'Action Failed',
              'I could not update that member’s permissions.',
              '#ef4444'
            ),
          ],
        });
      }
    }

    // --------------------------------------------------------
    // KICK
    // --------------------------------------------------------

    if (subcommand === 'kick') {
      const target = await resolveVCMember(
        client,
        message,
        args,
        1
      );

      if (!target) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'User Not Found',
              'Mention a server member, provide their ID, or enter a username supported by the universal user resolver.',
              '#f59e0b'
            ),
          ],
        });
      }

      if (target.id === message.author.id) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'Invalid User',
              'You cannot kick yourself from your own voice channel.',
              '#f59e0b'
            ),
          ],
        });
      }

      if (target.voice?.channelId !== channelId) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'User Not In VC',
              'That member is not currently in your voice channel.',
              '#f59e0b'
            ),
          ],
        });
      }

      const everyoneOverwrite =
        channel.permissionOverwrites.cache.get(guildId);

      const isLocked = Boolean(
        everyoneOverwrite?.deny.has(
          PermissionsBitField.Flags.Connect
        )
      );

      try {
        if (isLocked) {
          await channel.permissionOverwrites.edit(
            target.id,
            {
              ViewChannel: false,
              Connect: false,
            },
            {
              reason:
                `Member denied access after VC kick by ${message.author.tag}`,
            }
          );
        }

        await target.voice.disconnect(
          `Kicked from personal VC by ${message.author.tag}`
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'User Kicked',
              `${target.user} has been removed from your voice channel.`
            ),
          ],
        });
      } catch (error) {
        console.error(
          '[VC] Kick failed:',
          error
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'Action Failed',
              'I could not remove that member. Check Vanessa’s Move Members permission and role hierarchy.',
              '#ef4444'
            ),
          ],
        });
      }
    }

    // --------------------------------------------------------
    // USER LIMIT
    // --------------------------------------------------------

    if (subcommand === 'limit') {
      const amount = Number(args[1]);

      if (
        !Number.isInteger(amount) ||
        amount < 0 ||
        amount > 99
      ) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'Invalid Limit',
              'Choose a whole number from **0 to 99**. Use `0` to remove the limit.',
              '#f59e0b'
            ),
          ],
        });
      }

      try {
        await channel.setUserLimit(
          amount,
          reason
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'VC Limit Updated',

              amount === 0
                ? 'The user limit has been removed.'
                : `Your voice channel can now hold **${amount}** members.`
            ),
          ],
        });
      } catch (error) {
        console.error(
          '[VC] Limit update failed:',
          error
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'Action Failed',
              'I could not change the user limit. Check Vanessa’s Manage Channels permission.',
              '#ef4444'
            ),
          ],
        });
      }
    }

    // --------------------------------------------------------
    // SILENCE
    // --------------------------------------------------------

    if (subcommand === 'silence') {
      const members = [
        ...channel.members.values(),
      ].filter(
        member => member.id !== message.author.id
      );

      if (!members.length) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'Nothing To Silence',
              'There is nobody else in your voice channel.'
            ),
          ],
        });
      }

      let muted = 0;
      let failed = 0;

      for (const member of members) {
        // Do not claim mutes Vanessa did not apply.
        if (member.voice.serverMute) {
          continue;
        }

        try {
          await member.voice.setMute(
            true,
            `VC silence by ${message.author.tag}`
          );

          addTrackedMute(
            client,
            guildId,
            channelId,
            member.id
          );

          muted++;
        } catch (error) {
          failed++;

          console.error(
            `[VC] Could not mute ${member.id}:`,
            error
          );
        }
      }

      return message.reply({
        embeds: [
          createReplyEmbed(
            'VC Silenced',

            `Vanessa server-muted **${muted}** member${muted === 1 ? '' : 's'}.` +
            (
              failed
                ? `\nCould not mute **${failed}** member${failed === 1 ? '' : 's'}.`
                : ''
            )
          ),
        ],
      });
    }

    // --------------------------------------------------------
    // UNSILENCE
    // --------------------------------------------------------

    if (subcommand === 'unsilence') {
      const tracked = getTrackedMuted(
        client,
        guildId,
        channelId
      );

      if (!tracked.length) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'Nothing To Unsilence',
              'Vanessa has no tracked mutes in this voice channel.'
            ),
          ],
        });
      }

      let unmuted = 0;
      let failed = 0;

      for (const row of tracked) {
        const member =
          message.guild.members.cache.get(row.user_id) ||
          await message.guild.members
            .fetch(row.user_id)
            .catch(() => null);

        if (!member) {
          removeTrackedMute(
            client,
            guildId,
            channelId,
            row.user_id
          );

          continue;
        }

        if (member.voice.serverMute) {
          try {
            await member.voice.setMute(
              false,
              `VC unsilence by ${message.author.tag}`
            );

            unmuted++;
          } catch (error) {
            failed++;

            console.error(
              `[VC] Could not unmute ${member.id}:`,
              error
            );
          }
        }

        removeTrackedMute(
          client,
          guildId,
          channelId,
          row.user_id
        );
      }

      return message.reply({
        embeds: [
          createReplyEmbed(
            'VC Unsilenced',

            `Removed Vanessa’s tracked server mute from **${unmuted}** member${unmuted === 1 ? '' : 's'}.` +
            (
              failed
                ? `\nCould not unmute **${failed}** member${failed === 1 ? '' : 's'}.`
                : ''
            )
          ),
        ],
      });
    }

    // --------------------------------------------------------
    // GHOST
    // --------------------------------------------------------

    if (subcommand === 'ghost') {
      const everyoneOverwrite =
        channel.permissionOverwrites.cache.get(guildId);

      const currentlyGhosted = Boolean(
        everyoneOverwrite?.deny.has(
          PermissionsBitField.Flags.ViewChannel
        )
      );

      try {
        await channel.permissionOverwrites.edit(
          guildId,
          {
            ViewChannel: currentlyGhosted ? true : false,
          },
          {
            reason:
              `VC ghost ${currentlyGhosted ? 'disabled' : 'enabled'} by ${message.author.tag}`,
          }
        );

        await channel.permissionOverwrites.edit(
          message.author.id,
          {
            ViewChannel: true,
            Connect: true,
          },
          {
            reason: 'Ensure personal VC owner retains access',
          }
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              currentlyGhosted
                ? 'Ghost Disabled'
                : 'Ghost Enabled',

              currentlyGhosted
                ? 'Your voice channel is visible to everyone again.'
                : 'Your voice channel is hidden from members who do not have explicit access.'
            ),
          ],
        });
      } catch (error) {
        console.error(
          '[VC] Ghost toggle failed:',
          error
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'Action Failed',
              'I could not change the channel visibility. Check Vanessa’s Manage Channels permission.',
              '#ef4444'
            ),
          ],
        });
      }
    }

    // --------------------------------------------------------
    // AFK
    // --------------------------------------------------------

    if (subcommand === 'afk') {
      const state = getVCState(
        client,
        guildId,
        channelId
      );

      if (!state) {
        return message.reply({
          embeds: [
            createReplyEmbed(
              'VC Not Registered',
              'This channel is not registered as a Vanessa personal voice channel.',
              '#ef4444'
            ),
          ],
        });
      }

      if (state.afk_enabled) {
        ensureDB(client).prepare(`
          UPDATE vc_channels
          SET afk_enabled = 0,
              afk_expires_at = NULL
          WHERE guild_id = ?
            AND channel_id = ?
        `).run(
          guildId,
          channelId
        );

        cancelAFKTimer(
          client,
          channelId
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'AFK Disabled',
              'Your voice channel will be deleted normally as soon as it becomes empty.'
            ),
          ],
        });
      }

      ensureDB(client).prepare(`
        UPDATE vc_channels
        SET afk_enabled = 1,
            afk_expires_at = NULL
        WHERE guild_id = ?
          AND channel_id = ?
      `).run(
        guildId,
        channelId
      );

      cancelAFKTimer(
        client,
        channelId
      );

      return message.reply({
        embeds: [
          createReplyEmbed(
            'AFK Enabled',
            'Your voice channel will stay open for **30 minutes after it becomes empty**. If someone joins, the countdown pauses; the setting stays enabled until you toggle it off.'
          ),
        ],
      });
    }

    // --------------------------------------------------------
    // RESET
    // --------------------------------------------------------

    if (subcommand === 'reset') {
      try {
        // Only remove tracked mutes applied by this system.
        for (
          const row of getTrackedMuted(
            client,
            guildId,
            channelId
          )
        ) {
          const member =
            message.guild.members.cache.get(row.user_id) ||
            await message.guild.members
              .fetch(row.user_id)
              .catch(() => null);

          if (member?.voice?.serverMute) {
            await member.voice.setMute(
              false,
              `Personal VC reset by ${message.author.tag}`
            ).catch(() => {});
          }
        }

        clearTrackedMutes(
          client,
          guildId,
          channelId
        );

        cancelAFKTimer(
          client,
          channelId
        );

        ensureDB(client).prepare(`
          UPDATE vc_channels
          SET afk_enabled = 0,
              afk_expires_at = NULL
          WHERE guild_id = ?
            AND channel_id = ?
        `).run(
          guildId,
          channelId
        );

        // Remove member-specific overwrites.
        // Preserve @everyone and the owner.
        for (
          const overwrite of [
            ...channel.permissionOverwrites.cache.values()
          ]
        ) {
          if (
            overwrite.id === guildId ||
            overwrite.id === message.author.id
          ) {
            continue;
          }

          if (overwrite.type === 1) {
            await channel.permissionOverwrites.delete(
              overwrite.id,
              'Personal VC reset'
            ).catch(() => {});
          }
        }

        await channel.permissionOverwrites.edit(
          guildId,
          {
            ViewChannel: true,
            Connect: true,
          },
          {
            reason:
              `Personal VC reset by ${message.author.tag}`,
          }
        );

        await channel.permissionOverwrites.edit(
          message.author.id,
          {
            ViewChannel: true,
            Connect: true,
            Speak: true,
          },
          {
            reason:
              'Restore personal VC owner access after reset',
          }
        );

        await channel.setUserLimit(
          0,
          'Personal VC reset'
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'VC Reset',
              'Your voice channel has been reset: lock, permits/denials, ghost, user limit, Vanessa-tracked mutes, and AFK mode have been cleared. The channel itself remains.'
            ),
          ],
        });
      } catch (error) {
        console.error(
          '[VC] Reset failed:',
          error
        );

        return message.reply({
          embeds: [
            createReplyEmbed(
              'Reset Failed',
              'I could not fully reset the voice channel. Check Vanessa’s Manage Channels and Mute Members permissions.',
              '#ef4444'
            ),
          ],
        });
      }
    }

    // --------------------------------------------------------
    // UNKNOWN COMMAND
    // --------------------------------------------------------

    return message.reply({
      embeds: [
        createReplyEmbed(
          'Unknown VC Command',
          `Use \`${prefix}vchelp\` to see the available commands.`,
          '#f59e0b'
        ),
      ],
    });
  },

  // Export helpers for vchandler.js.
  initDB: ensureDB,
  getGuildSettings,
  getJoinToCreateId,
  setGuildSettings,
  clearGuildSettings,
  registerChannel,
  deleteChannelState,
  getVCState,
  getOwnerVC,
  getTrackedMuted,
  addTrackedMute,
  removeTrackedMute,
  clearTrackedMutes,
};