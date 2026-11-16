const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  PermissionFlagsBits,
} = require('discord.js');

const pendingActions = new Map();

const COLORS = {
  primary: '#5865F2',
  success: '#3BA55D',
  danger: '#ED4245',
  warning: '#FAA61A',
  muted: '#747F8D',
};

// Optional modstats helper
let modstatsHelper = null;

try {
  modstatsHelper = require('./modstatsHelper');
} catch {}

const logModAction =
  typeof modstatsHelper?.logModAction === 'function'
    ? modstatsHelper.logModAction
    : () => {};

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

function initializeAutomodTables(client) {
  if (!client?.automodDB) {
    throw new Error('Missing client.automodDB');
  }

  client.automodDB.exec(`
    CREATE TABLE IF NOT EXISTS automod_global_whitelist (
      guild_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      PRIMARY KEY (guild_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS automod_channel_whitelist (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      PRIMARY KEY (guild_id, channel_id, target_type, target_id)
    );
  `);
}

// ============================================================
// AUTOMOD ALERT CHANNEL
// ============================================================

function setAutomodChannel(client, guildId, channelId) {
  if (!client?.automodDB) return false;

  client.automodDB.prepare(`
    INSERT OR REPLACE INTO automod_channel
      (guild_id, channel_id)
    VALUES (?, ?)
  `).run(guildId, channelId);

  return true;
}

function getAutomodChannel(client, guildId) {
  if (!client?.automodDB) return null;

  const row = client.automodDB.prepare(`
    SELECT channel_id
    FROM automod_channel
    WHERE guild_id = ?
  `).get(guildId);

  return row?.channel_id || null;
}

// ============================================================
// ALERT TARGETS
// ============================================================

function addAlertTarget(client, guildId, type, id) {
  if (!client?.automodDB) return false;

  client.automodDB.prepare(`
    INSERT OR IGNORE INTO automod_alert_list
      (guild_id, target_type, target_id)
    VALUES (?, ?, ?)
  `).run(guildId, type, id);

  return true;
}

function removeAlertTarget(client, guildId, type, id) {
  if (!client?.automodDB) return false;

  const result = client.automodDB.prepare(`
    DELETE FROM automod_alert_list
    WHERE guild_id = ?
      AND target_type = ?
      AND target_id = ?
  `).run(guildId, type, id);

  return result.changes > 0;
}

function listAlertTargets(client, guildId) {
  if (!client?.automodDB) return [];

  return client.automodDB.prepare(`
    SELECT target_type, target_id
    FROM automod_alert_list
    WHERE guild_id = ?
    ORDER BY target_type, target_id
  `).all(guildId);
}

// ============================================================
// SERVER-WIDE WHITELIST
// ============================================================

function addGlobalWhitelist(client, guildId, type, id) {
  if (!client?.automodDB) return false;

  client.automodDB.prepare(`
    INSERT OR IGNORE INTO automod_global_whitelist
      (guild_id, target_type, target_id)
    VALUES (?, ?, ?)
  `).run(guildId, type, id);

  return true;
}

function removeGlobalWhitelist(client, guildId, type, id) {
  if (!client?.automodDB) return false;

  const result = client.automodDB.prepare(`
    DELETE FROM automod_global_whitelist
    WHERE guild_id = ?
      AND target_type = ?
      AND target_id = ?
  `).run(guildId, type, id);

  return result.changes > 0;
}

function listGlobalWhitelist(client, guildId) {
  if (!client?.automodDB) return [];

  return client.automodDB.prepare(`
    SELECT target_type, target_id
    FROM automod_global_whitelist
    WHERE guild_id = ?
    ORDER BY target_type, target_id
  `).all(guildId);
}

// ============================================================
// CHANNEL-SPECIFIC WHITELIST
// ============================================================

function addChannelWhitelist(
  client,
  guildId,
  channelId,
  type,
  id
) {
  if (!client?.automodDB) return false;

  client.automodDB.prepare(`
    INSERT OR IGNORE INTO automod_channel_whitelist
      (guild_id, channel_id, target_type, target_id)
    VALUES (?, ?, ?, ?)
  `).run(guildId, channelId, type, id);

  return true;
}

function removeChannelWhitelist(
  client,
  guildId,
  channelId,
  type,
  id
) {
  if (!client?.automodDB) return false;

  const result = client.automodDB.prepare(`
    DELETE FROM automod_channel_whitelist
    WHERE guild_id = ?
      AND channel_id = ?
      AND target_type = ?
      AND target_id = ?
  `).run(guildId, channelId, type, id);

  return result.changes > 0;
}

function listChannelWhitelist(client, guildId, channelId) {
  if (!client?.automodDB) return [];

  return client.automodDB.prepare(`
    SELECT target_type, target_id
    FROM automod_channel_whitelist
    WHERE guild_id = ?
      AND channel_id = ?
    ORDER BY target_type, target_id
  `).all(guildId, channelId);
}

// ============================================================
// WHITELIST CHECK
// ============================================================

function matchesWhitelist(rows, member) {
  if (!member) return false;

  const userId = String(member.id);

  const roleIds = new Set(
    member.roles.cache.keys()
  );

  return rows.some(row => {
    if (
      row.target_type === 'user' &&
      String(row.target_id) === userId
    ) {
      return true;
    }

    if (
      row.target_type === 'role' &&
      roleIds.has(String(row.target_id))
    ) {
      return true;
    }

    return false;
  });
}

function isMessageWhitelisted(client, message) {
  if (
    !client?.automodDB ||
    !message?.guild ||
    !message?.member
  ) {
    return false;
  }

  const guildId = message.guild.id;

  // Check server-wide whitelist.
  const globalRows = listGlobalWhitelist(
    client,
    guildId
  );

  if (matchesWhitelist(globalRows, message.member)) {
    return true;
  }

  // Check this channel's whitelist.
  const channelRows = listChannelWhitelist(
    client,
    guildId,
    message.channel.id
  );

  return matchesWhitelist(channelRows, message.member);
}

// ============================================================
// HARD BLACKLIST
// ============================================================

function addHardWord(client, guildId, word) {
  if (!client?.automodDB) return false;

  const normalized = String(word).toLowerCase().trim();

  if (!normalized) return false;

  client.automodDB.prepare(`
    INSERT OR IGNORE INTO blacklist_hard
      (guild_id, word)
    VALUES (?, ?)
  `).run(guildId, normalized);

  if (!client.blacklistCache) {
    client.blacklistCache = new Map();
  }

  if (!client.blacklistCache.has(guildId)) {
    client.blacklistCache.set(guildId, {
      hard: [],
      soft: [],
    });
  }

  const cache = client.blacklistCache.get(guildId);

  if (!cache.hard.includes(normalized)) {
    cache.hard.push(normalized);
  }

  return true;
}

function removeHardWord(client, guildId, word) {
  if (!client?.automodDB) return false;

  const normalized = String(word).toLowerCase().trim();

  client.automodDB.prepare(`
    DELETE FROM blacklist_hard
    WHERE guild_id = ? AND word = ?
  `).run(guildId, normalized);

  if (client.blacklistCache?.has(guildId)) {
    const cache = client.blacklistCache.get(guildId);

    cache.hard = cache.hard.filter(
      entry => entry !== normalized
    );
  }

  return true;
}

function listHardWords(client, guildId) {
  if (client.blacklistCache?.has(guildId)) {
    return client.blacklistCache.get(guildId).hard;
  }

  if (!client?.automodDB) return [];

  return client.automodDB.prepare(`
    SELECT word
    FROM blacklist_hard
    WHERE guild_id = ?
    ORDER BY word
  `).all(guildId).map(row => row.word);
}

// ============================================================
// SOFT BLACKLIST
// ============================================================

function addSoftWord(client, guildId, word) {
  if (!client?.automodDB) return false;

  const normalized = String(word).toLowerCase().trim();

  if (!normalized) return false;

  client.automodDB.prepare(`
    INSERT OR IGNORE INTO blacklist_soft
      (guild_id, word)
    VALUES (?, ?)
  `).run(guildId, normalized);

  if (!client.blacklistCache) {
    client.blacklistCache = new Map();
  }

  if (!client.blacklistCache.has(guildId)) {
    client.blacklistCache.set(guildId, {
      hard: [],
      soft: [],
    });
  }

  const cache = client.blacklistCache.get(guildId);

  if (!cache.soft.includes(normalized)) {
    cache.soft.push(normalized);
  }

  return true;
}

function removeSoftWord(client, guildId, word) {
  if (!client?.automodDB) return false;

  const normalized = String(word).toLowerCase().trim();

  client.automodDB.prepare(`
    DELETE FROM blacklist_soft
    WHERE guild_id = ? AND word = ?
  `).run(guildId, normalized);

  if (client.blacklistCache?.has(guildId)) {
    const cache = client.blacklistCache.get(guildId);

    cache.soft = cache.soft.filter(
      entry => entry !== normalized
    );
  }

  return true;
}

function listSoftWords(client, guildId) {
  if (client.blacklistCache?.has(guildId)) {
    return client.blacklistCache.get(guildId).soft;
  }

  if (!client?.automodDB) return [];

  return client.automodDB.prepare(`
    SELECT word
    FROM blacklist_soft
    WHERE guild_id = ?
    ORDER BY word
  `).all(guildId).map(row => row.word);
}

// ============================================================
// WARN HELPERS
// ============================================================

function listWarns(client, guildId, userId) {
  if (!client?.automodDB) return [];

  return client.automodDB.prepare(`
    SELECT moderator_id, reason, timestamp
    FROM automod_warns
    WHERE guild_id = ?
      AND user_id = ?
    ORDER BY timestamp DESC
  `).all(guildId, userId);
}

function getWarnCount(client, guildId, userId) {
  if (!client?.automodDB) return 0;

  return client.automodDB.prepare(`
    SELECT count
    FROM automod_warn_counts
    WHERE guild_id = ?
      AND user_id = ?
  `).get(guildId, userId)?.count || 0;
}

// ============================================================
// WHOLE-WORD MATCHING
// ============================================================

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWholeWordRegex(phrase) {
  const tokens = String(phrase)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(escapeRegex);

  return new RegExp(`\\b${tokens.join('\\s+')}\\b`, 'i');
}

// ============================================================
// EMBED HELPERS
// ============================================================

function truncate(value, maxLength = 1000) {
  const text = String(value || '');

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function buildAlertEmbed(
  guild,
  targetUser,
  matchedWord,
  channelId,
  fullMessage
) {
  const safeMessage = truncate(fullMessage, 900)
    .replace(/```/g, "'''");

  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setAuthor({
      name: 'Automod • Message blocked',
      iconURL: guild.iconURL({ size: 128 }) || undefined,
    })
    .setThumbnail(
      targetUser.displayAvatarURL({ size: 256 })
    )
    .setDescription(
      `A message from **${targetUser.tag}** was detected by automod.`
    )
    .addFields(
      {
        name: 'Member',
        value: `<@${targetUser.id}>\n\`${targetUser.id}\``,
        inline: true,
      },
      {
        name: 'Channel',
        value: channelId
          ? `<#${channelId}>`
          : 'Unknown',
        inline: true,
      },
      {
        name: 'Detection',
        value: `\`${truncate(matchedWord, 200)}\``,
        inline: true,
      },
      {
        name: 'Deleted message',
        value: safeMessage
          ? `\`\`\`\n${safeMessage}\n\`\`\``
          : 'Message content unavailable.',
        inline: false,
      }
    )
    .setFooter({
      text: `${guild.name} • Automod`,
    })
    .setTimestamp();
}

function isStaff(member) {
  if (!member?.permissions) return false;

  return (
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

// ============================================================
// SEND AUTOMOD ALERT
// ============================================================

async function sendAutomodAlert(
  client,
  guild,
  targetUser,
  matchedWord,
  channelId = null,
  fullMessage = null
) {
  try {
    const alertChannelId = getAutomodChannel(
      client,
      guild.id
    );

    if (!alertChannelId) return null;

    const channel = await client.channels
      .fetch(alertChannelId)
      .catch(() => null);

    if (!channel?.isTextBased()) return null;

    const entries = listAlertTargets(
      client,
      guild.id
    );

    const userIds = entries
      .filter(entry => entry.target_type === 'user')
      .map(entry => entry.target_id);

    const roleIds = entries
      .filter(entry => entry.target_type === 'role')
      .map(entry => entry.target_id);

    const mentions = [
      ...roleIds.map(id => `<@&${id}>`),
      ...userIds.map(id => `<@${id}>`),
    ].join(' ');

    // Ghost ping configured alert targets.
    if (mentions) {
      try {
        const pingMessage = await channel.send({
          content: mentions,
          allowedMentions: {
            users: userIds,
            roles: roleIds,
          },
        });

        setTimeout(() => {
          pingMessage.delete().catch(() => {});
        }, 800);
      } catch (error) {
        console.error('[Automod] Alert ping failed:', error);
      }
    }

    const embed = buildAlertEmbed(
      guild,
      targetUser,
      matchedWord,
      channelId,
      fullMessage
    );

    const sent = await channel.send({
      embeds: [embed],
    });

    pendingActions.set(sent.id, {
      guildId: guild.id,
      targetUserId: targetUser.id,
      matchedWord,
      handled: false,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`am_warn:${sent.id}`)
        .setLabel('Warn')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`am_ban:${sent.id}`)
        .setLabel('Ban')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`am_ignore:${sent.id}`)
        .setLabel('Dismiss')
        .setStyle(ButtonStyle.Secondary)
    );

    await sent.edit({
      components: [row],
    });

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30 * 60 * 1000,
    });

    collector.on('collect', async interaction => {
      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: 'You do not have permission to handle this alert.',
          ephemeral: true,
        }).catch(() => {});

        return;
      }

      const state = pendingActions.get(sent.id);

      if (!state || state.handled) {
        await interaction.reply({
          content: 'This alert has already been handled.',
          ephemeral: true,
        }).catch(() => {});

        return;
      }

      if (interaction.customId === `am_ignore:${sent.id}`) {
        state.handled = true;

        const updatedEmbed = EmbedBuilder
          .from(embed)
          .setColor(COLORS.muted)
          .setFooter({
            text: `Dismissed by ${interaction.user.tag}`,
          });

        await sent.edit({
          embeds: [updatedEmbed],
          components: [],
        }).catch(() => {});

        await interaction.reply({
          content: 'Alert dismissed.',
          ephemeral: true,
        }).catch(() => {});

        collector.stop('handled');
        return;
      }

      if (interaction.customId === `am_warn:${sent.id}`) {
        state.handled = true;

        const modal = new ModalBuilder()
          .setCustomId(
            `am_warn_modal:${sent.id}:${state.targetUserId}`
          )
          .setTitle('Issue automod warning');

        const reasonInput = new TextInputBuilder()
          .setCustomId('warn_reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);

        modal.addComponents(
          new ActionRowBuilder().addComponents(reasonInput)
        );

        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId === `am_ban:${sent.id}`) {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`am_ban_confirm:${sent.id}`)
            .setLabel('Confirm ban')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId(`am_ban_cancel:${sent.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          content: `Confirm the ban of <@${state.targetUserId}>?`,
          components: [confirmRow],
          ephemeral: true,
        }).catch(() => {});
      }
    });

    collector.on('end', () => {
      pendingActions.delete(sent.id);

      sent.edit({
        components: [],
      }).catch(() => {});
    });

    return sent;
  } catch (error) {
    console.error('[Automod] sendAutomodAlert error:', error);
    return null;
  }
}

// ============================================================
// MAIN AUTOMOD CHECK
// ============================================================

async function checkMessage(client, message) {
  try {
    if (
      !message.guild ||
      !message.member ||
      message.author.bot
    ) {
      return;
    }

    // Existing administrator exemption.
    if (
      message.member.permissions.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return;
    }

    // Whitelist check happens before every automod rule.
    if (isMessageWhitelisted(client, message)) {
      return;
    }

    const guildId = message.guild.id;
    const contentRaw = message.content || '';
    const content = contentRaw.toLowerCase();

    // --------------------------------------------------------
    // SOFT BLACKLIST: DELETE ONLY
    // --------------------------------------------------------

    const softWords = listSoftWords(client, guildId);

    for (const word of softWords) {
      if (!word) continue;

      if (buildWholeWordRegex(word).test(content)) {
        await message.delete().catch(() => {});

        console.log(
          `[Automod] Soft word "${word}" deleted from ${message.author.tag}`
        );

        return;
      }
    }

    // --------------------------------------------------------
    // HARD BLACKLIST: DELETE + TIMEOUT + ALERT
    // --------------------------------------------------------

    const hardWords = listHardWords(client, guildId);

    for (const word of hardWords) {
      if (!word) continue;

      if (buildWholeWordRegex(word).test(content)) {
        await message.delete().catch(() => {});

        try {
          if (message.member.moderatable) {
            await message.member.timeout(
              15 * 60 * 1000,
              `Automod triggered: ${word}`
            );

            try {
              logModAction(
                client,
                guildId,
                'AUTOMOD-SYSTEM',
                message.author.id,
                'mute',
                `Automod: triggered "${word}"`,
                '15m'
              );
            } catch {}
          }
        } catch (error) {
          console.error('[Automod] Timeout failed:', error);
        }

        await sendAutomodAlert(
          client,
          message.guild,
          message.author,
          word,
          message.channel.id,
          contentRaw
        );

        return;
      }
    }

    // --------------------------------------------------------
    // DISCORD INVITE LINKS
    // --------------------------------------------------------

    const inviteRegex =
      /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\/[A-Za-z0-9]+/i;

    if (
      inviteRegex.test(contentRaw) &&
      !message.member.permissions.has(
        PermissionFlagsBits.CreateInstantInvite
      )
    ) {
      await message.delete().catch(() => {});

      try {
        if (message.member.moderatable) {
          await message.member.timeout(
            60 * 60 * 1000,
            'Automod: Discord invite link'
          );

          try {
            logModAction(
              client,
              guildId,
              'AUTOMOD-SYSTEM',
              message.author.id,
              'mute',
              'Discord invite link',
              '1h'
            );
          } catch {}
        }
      } catch (error) {
        console.error('[Automod] Invite timeout failed:', error);
      }

      await sendAutomodAlert(
        client,
        message.guild,
        message.author,
        'Discord invite link',
        message.channel.id,
        contentRaw
      );
    }

  } catch (error) {
    console.error('[Automod] checkMessage error:', error);
  }
}

// ============================================================
// WARNING MODAL HANDLER
// ============================================================

async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return;

  if (!interaction.customId.startsWith('am_warn_modal:')) {
    return;
  }

  try {
    const parts = interaction.customId.split(':');

    if (parts.length < 3) return;

    const messageId = parts[1];
    const targetUserId = parts[2];
    const guildId = interaction.guildId;

    const reason = interaction.fields
      .getTextInputValue('warn_reason')
      .slice(0, 1000);

    // Save warning.
    try {
      interaction.client.automodDB.prepare(`
        INSERT INTO automod_warns
          (guild_id, user_id, moderator_id, reason, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        guildId,
        targetUserId,
        interaction.user.id,
        reason || 'No reason provided',
        Date.now()
      );

      interaction.client.automodDB.prepare(`
        INSERT INTO automod_warn_counts
          (guild_id, user_id, count)
        VALUES (?, ?, 1)
        ON CONFLICT(guild_id, user_id)
        DO UPDATE SET count = count + 1
      `).run(guildId, targetUserId);

    } catch (error) {
      console.error('[Automod] Failed to save warning:', error);
    }

    // Record moderator action.
    try {
      logModAction(
        interaction.client,
        guildId,
        interaction.user.id,
        targetUserId,
        'warn',
        `AUTOMOD: ${reason}`
      );
    } catch {}

    // Update alert embed.
    try {
      const alertChannelId = getAutomodChannel(
        interaction.client,
        guildId
      );

      const channel = alertChannelId
        ? await interaction.client.channels
            .fetch(alertChannelId)
            .catch(() => null)
        : null;

      if (channel) {
        const original = await channel.messages
          .fetch(messageId)
          .catch(() => null);

        if (original?.embeds?.[0]) {
          const updatedEmbed = EmbedBuilder
            .from(original.embeds[0])
            .setColor(COLORS.warning)
            .addFields(
              {
                name: 'Action',
                value: `Warning issued by ${interaction.user.tag}`,
              },
              {
                name: 'Reason',
                value: truncate(reason || 'No reason provided', 1000),
              }
            )
            .setFooter({
              text: `Handled by ${interaction.user.tag}`,
            });

          await original.edit({
            embeds: [updatedEmbed],
            components: [],
          }).catch(() => {});
        }
      }
    } catch {}

    await interaction.reply({
      content: 'The warning has been saved.',
      ephemeral: true,
    });

    // DM the warned user.
    try {
      const user = await interaction.client.users
        .fetch(targetUserId)
        .catch(() => null);

      if (user) {
        const dmEmbed = new EmbedBuilder()
          .setColor(COLORS.warning)
          .setAuthor({
            name: 'Automod • Warning issued',
          })
          .setDescription(
            `You received a warning in **${interaction.guild.name}**.`
          )
          .addFields(
            {
              name: 'Reason',
              value: truncate(reason || 'No reason provided', 1000),
            },
            {
              name: 'Moderator',
              value: interaction.user.tag,
            }
          )
          .setTimestamp();

        await user.send({
          embeds: [dmEmbed],
        }).catch(() => {});
      }
    } catch {}

    pendingActions.delete(messageId);

  } catch (error) {
    console.error('[Automod] Modal handler error:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Failed to process the warning.',
        ephemeral: true,
      }).catch(() => {});
    }
  }
}

// ============================================================
// BAN CONFIRMATION HANDLER
// ============================================================

async function handleBanConfirmation(interaction) {
  if (!interaction.isButton()) return;

  const customId = interaction.customId || '';

  if (
    !customId.startsWith('am_ban_confirm:') &&
    !customId.startsWith('am_ban_cancel:')
  ) {
    return;
  }

  try {
    if (customId.startsWith('am_ban_cancel:')) {
      await interaction.update({
        content: 'Ban cancelled.',
        components: [],
      }).catch(() => {});

      return;
    }

    const parts = customId.split(':');

    if (parts.length < 2) return;

    const messageId = parts[1];
    const state = pendingActions.get(messageId);

    if (!state) {
      await interaction.update({
        content: 'This ban request has expired.',
        components: [],
      }).catch(() => {});

      return;
    }

    if (!isStaff(interaction.member)) {
      await interaction.update({
        content: 'You do not have permission to perform this action.',
        components: [],
      }).catch(() => {});

      return;
    }

    try {
      const guild = await interaction.client.guilds.fetch(
        state.guildId
      );

      const member = await guild.members
        .fetch(state.targetUserId)
        .catch(() => null);

      if (!member) {
        await interaction.update({
          content: 'The user is no longer in the server.',
          components: [],
        }).catch(() => {});

        return;
      }

      await member.ban({
        reason: `Automod ban: ${state.matchedWord}`,
      });

      try {
        logModAction(
          interaction.client,
          state.guildId,
          interaction.user.id,
          state.targetUserId,
          'ban',
          `AUTOMOD BAN: ${state.matchedWord}`
        );
      } catch {}

      const alertChannelId = getAutomodChannel(
        interaction.client,
        state.guildId
      );

      if (alertChannelId) {
        const channel = await interaction.client.channels
          .fetch(alertChannelId)
          .catch(() => null);

        if (channel) {
          const original = await channel.messages
            .fetch(messageId)
            .catch(() => null);

          if (original?.embeds?.[0]) {
            const updatedEmbed = EmbedBuilder
              .from(original.embeds[0])
              .setColor(COLORS.danger)
              .addFields({
                name: 'Action',
                value: `Member banned by ${interaction.user.tag}`,
              })
              .setFooter({
                text: `Handled by ${interaction.user.tag}`,
              });

            await original.edit({
              embeds: [updatedEmbed],
              components: [],
            }).catch(() => {});
          }
        }
      }

      state.handled = true;
      pendingActions.delete(messageId);

      await interaction.update({
        content: 'The member has been banned.',
        components: [],
      }).catch(() => {});

    } catch (error) {
      console.error('[Automod] Ban confirmation error:', error);

      await interaction.update({
        content: 'Failed to ban the member. Check bot permissions and role hierarchy.',
        components: [],
      }).catch(() => {});
    }

  } catch (error) {
    console.error('[Automod] handleBanConfirmation error:', error);
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

function initAutomod(client) {
  if (!client) {
    console.error('[Automod] Client required.');
    return false;
  }

  if (!client.automodDB) {
    console.error('[Automod] Missing client.automodDB.');
    return false;
  }

  if (!client.blacklistCache) {
    client.blacklistCache = new Map();
  }

  try {
    initializeAutomodTables(client);

    // Restore blacklist cache from SQLite.
    const guildRows = client.automodDB.prepare(`
      SELECT guild_id FROM blacklist_hard
      UNION
      SELECT guild_id FROM blacklist_soft
    `).all();

    for (const { guild_id } of guildRows) {
      const hard = client.automodDB.prepare(`
        SELECT word
        FROM blacklist_hard
        WHERE guild_id = ?
      `).all(guild_id).map(row => row.word);

      const soft = client.automodDB.prepare(`
        SELECT word
        FROM blacklist_soft
        WHERE guild_id = ?
      `).all(guild_id).map(row => row.word);

      client.blacklistCache.set(guild_id, {
        hard,
        soft,
      });
    }

  } catch (error) {
    console.error('[Automod] Initialization/database error:', error);
    return false;
  }

  // Expose API through client.automod.
  client.automod = {
    setAutomodChannel: (guildId, channelId) =>
      setAutomodChannel(client, guildId, channelId),

    getAutomodChannel: guildId =>
      getAutomodChannel(client, guildId),

    addAlertTarget: (guildId, type, id) =>
      addAlertTarget(client, guildId, type, id),

    removeAlertTarget: (guildId, type, id) =>
      removeAlertTarget(client, guildId, type, id),

    listAlertTargets: guildId =>
      listAlertTargets(client, guildId),

    addGlobalWhitelist: (guildId, type, id) =>
      addGlobalWhitelist(client, guildId, type, id),

    removeGlobalWhitelist: (guildId, type, id) =>
      removeGlobalWhitelist(client, guildId, type, id),

    listGlobalWhitelist: guildId =>
      listGlobalWhitelist(client, guildId),

    addChannelWhitelist: (guildId, channelId, type, id) =>
      addChannelWhitelist(client, guildId, channelId, type, id),

    removeChannelWhitelist: (guildId, channelId, type, id) =>
      removeChannelWhitelist(client, guildId, channelId, type, id),

    listChannelWhitelist: (guildId, channelId) =>
      listChannelWhitelist(client, guildId, channelId),

    isMessageWhitelisted: message =>
      isMessageWhitelisted(client, message),

    addHardWord: (guildId, word) =>
      addHardWord(client, guildId, word),

    removeHardWord: (guildId, word) =>
      removeHardWord(client, guildId, word),

    listHardWords: guildId =>
      listHardWords(client, guildId),

    addSoftWord: (guildId, word) =>
      addSoftWord(client, guildId, word),

    removeSoftWord: (guildId, word) =>
      removeSoftWord(client, guildId, word),

    listSoftWords: guildId =>
      listSoftWords(client, guildId),

    listWarns: (guildId, userId) =>
      listWarns(client, guildId, userId),

    getWarnCount: (guildId, userId) =>
      getWarnCount(client, guildId, userId),

    checkMessage: message =>
      checkMessage(client, message),
  };

  // Bind interaction listener only once.
  if (!client.__automodInteractionsBound) {
    client.__automodInteractionsBound = true;

    client.on('interactionCreate', async interaction => {
      try {
        if (
          interaction.isModalSubmit() &&
          interaction.customId?.startsWith('am_warn_modal:')
        ) {
          await handleModal(interaction);
          return;
        }

        if (
          interaction.isButton() &&
          (
            interaction.customId?.startsWith('am_ban_confirm:') ||
            interaction.customId?.startsWith('am_ban_cancel:')
          )
        ) {
          await handleBanConfirmation(interaction);
        }

      } catch (error) {
        console.error('[Automod] Interaction error:', error);
      }
    });
  }

  console.log('[Automod] Initialized with whitelist support.');

  return true;
}

module.exports = {
  initAutomod,
};