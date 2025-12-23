const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  PermissionsBitField
} = require('discord.js');

const pendingActions = new Map();
const LIGHT_PINK = '#FF69B4';

// Helper to escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Database functions
function setAutomodChannel(guildId, channelId) {
  if (!this.automodDB) return false;
  this.automodDB.prepare(`INSERT OR REPLACE INTO automod_channel (guild_id, channel_id) VALUES (?, ?)`).run(guildId, channelId);
  return true;
}

function getAutomodChannel(guildId) {
  if (!this.automodDB) return null;
  const r = this.automodDB.prepare(`SELECT channel_id FROM automod_channel WHERE guild_id = ?`).get(guildId);
  return r?.channel_id || null;
}

function addAlertTarget(guildId, type, id) {
  if (!this.automodDB) return false;
  this.automodDB.prepare(`INSERT OR IGNORE INTO automod_alert_list (guild_id, target_type, target_id) VALUES (?, ?, ?)`).run(guildId, type, id);
  return true;
}

function removeAlertTarget(guildId, type, id) {
  if (!this.automodDB) return false;
  this.automodDB.prepare(`DELETE FROM automod_alert_list WHERE guild_id = ? AND target_type = ? AND target_id = ?`).run(guildId, type, id);
  return true;
}

function listAlertTargets(guildId) {
  if (!this.automodDB) return [];
  return this.automodDB.prepare(`SELECT target_type, target_id FROM automod_alert_list WHERE guild_id = ?`).all(guildId);
}

function addHardWord(guildId, word) {
  if (!this.automodDB) return false;
  const lowerWord = word.toLowerCase().trim();
  this.automodDB.prepare(`INSERT OR IGNORE INTO blacklist_hard (guild_id, word) VALUES (?, ?)`).run(guildId, lowerWord);

  // Update cache
  if (!this.blacklistCache.has(guildId)) {
    this.blacklistCache.set(guildId, { hard: [], soft: [] });
  }
  const cache = this.blacklistCache.get(guildId);
  if (!cache.hard.includes(lowerWord)) {
    cache.hard.push(lowerWord);
  }

  return true;
}

function removeHardWord(guildId, word) {
  if (!this.automodDB) return false;
  const lowerWord = word.toLowerCase().trim();
  this.automodDB.prepare(`DELETE FROM blacklist_hard WHERE guild_id = ? AND word = ?`).run(guildId, lowerWord);

  // Update cache
  if (this.blacklistCache.has(guildId)) {
    const cache = this.blacklistCache.get(guildId);
    cache.hard = cache.hard.filter(w => w !== lowerWord);
  }

  return true;
}

function listHardWords(guildId) {
  if (!this.automodDB) return [];
  if (this.blacklistCache && this.blacklistCache.has(guildId)) {
    return this.blacklistCache.get(guildId).hard;
  }
  return this.automodDB.prepare(`SELECT word FROM blacklist_hard WHERE guild_id = ?`).all(guildId).map(r => r.word);
}

function addSoftWord(guildId, word) {
  if (!this.automodDB) return false;
  const lowerWord = word.toLowerCase().trim();
  this.automodDB.prepare(`INSERT OR IGNORE INTO blacklist_soft (guild_id, word) VALUES (?, ?, ?)`).run(guildId, lowerWord);

  // Update cache
  if (!this.blacklistCache.has(guildId)) {
    this.blacklistCache.set(guildId, { hard: [], soft: [] });
  }
  const cache = this.blacklistCache.get(guildId);
  if (!cache.soft.includes(lowerWord)) {
    cache.soft.push(lowerWord);
  }

  return true;
}

function removeSoftWord(guildId, word) {
  if (!this.automodDB) return false;
  const lowerWord = word.toLowerCase().trim();
  this.automodDB.prepare(`DELETE FROM blacklist_soft WHERE guild_id = ? AND word = ?`).run(guildId, lowerWord);

  // Update cache
  if (this.blacklistCache.has(guildId)) {
    const cache = this.blacklistCache.get(guildId);
    cache.soft = cache.soft.filter(w => w !== lowerWord);
  }

  return true;
}

function listSoftWords(guildId) {
  if (!this.automodDB) return [];
  if (this.blacklistCache && this.blacklistCache.has(guildId)) {
    return this.blacklistCache.get(guildId).soft;
  }
  return this.automodDB.prepare(`SELECT word FROM blacklist_soft WHERE guild_id = ?`).all(guildId).map(r => r.word);
}

// Build alert embed
function buildAlertEmbed(guild, targetUser, matchedWord, channelId) {
  const embed = new EmbedBuilder()
    .setTitle('「 ✦ 𝐀𝐔𝐓𝐎𝐌𝐎𝐃 𝐀𝐋𝐄𝐑𝐓 ✦ 」')
    .setColor(LIGHT_PINK)
    .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
    .setDescription([
      `➤  **Target:** ${targetUser.tag}`,
      `➤  **Trigger:** \`${matchedWord}\``,
      `➤  **Channel:** ${channelId ? `<#${channelId}>` : 'Unknown'}`,
      `➤  **Time:** <t:${Math.floor(Date.now() / 1000)}:R>`,
      '',
      `**Actions:** Use the buttons below to Warn / Ban / Ignore.`
    ].join('\n'));
  return embed;
}

function isStaff(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageMessages) ||
         member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
         member.permissions.has(PermissionFlagsBits.Administrator);
}

// FIXED: Properly logs moderation actions to database
function logModAction(client, guildId, moderatorId, targetId, actionType, reason, duration = null) {
  try {
    console.log(`[ModStats] Attempting to log: ${actionType} by ${moderatorId} on ${targetId}`);
    
    // Skip logging unmutes entirely
    if (actionType.toLowerCase() === 'unmute') {
      console.log(`[ModStats] Skipping unmute log`);
      return false;
    }
    
    // Get the database - check both references
    const db = client.automodDB;
    if (!db) {
      console.error('[ModStats] No database available!');
      return false;
    }

    // Ensure the table exists
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS modstats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          moderator_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          action_type TEXT NOT NULL,
          reason TEXT,
          duration TEXT,
          timestamp INTEGER NOT NULL
        )
      `).run();
    } catch (tableErr) {
      console.error('[ModStats] Table creation error:', tableErr);
    }

    const timestamp = Date.now();
    const stmt = db.prepare(
      'INSERT INTO modstats (guild_id, moderator_id, target_id, action_type, reason, duration, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    stmt.run(guildId, moderatorId, targetId, actionType, reason || 'No reason provided', duration, timestamp);
    
    console.log(`[ModStats] Successfully logged ${actionType} to database`);
    return true;
  } catch (error) {
    console.error('[ModStats] Failed to log action:', error);
    console.error('[ModStats] Error details:', error.message);
    return false;
  }
}

async function sendAutomodAlert(client, guild, targetUser, matchedWord, channelId = null) {
  try {
    const alertChannelId = getAutomodChannel.call(client, guild.id);
    if (!alertChannelId) return null;

    const channel = await client.channels.fetch(alertChannelId).catch(() => null);
    if (!channel) return null;

    // Ghost ping setup
    const entries = listAlertTargets.call(client, guild.id);
    const mentionUsers = entries.filter(e => e.target_type === 'user').map(e => `<@${e.target_id}>`);
    const mentionRoles = entries.filter(e => e.target_type === 'role').map(e => `<@&${e.target_id}>`);
    const allMentions = [...mentionRoles, ...mentionUsers].join(' ');

    if (allMentions.trim()) {
      try {
        const pingMessage = await channel.send({ 
          content: allMentions,
          allowedMentions: { parse: ['users', 'roles'] }
        });
        setTimeout(() => pingMessage.delete().catch(() => {}), 100);
      } catch {}
    }

    const embed = buildAlertEmbed(guild, targetUser, matchedWord, channelId);
    const sent = await channel.send({ embeds: [embed] });

    pendingActions.set(sent.id, {
      guildId: guild.id,
      targetUserId: targetUser.id,
      matchedWord,
      handled: false,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`am_warn:${sent.id}`).setLabel('Warn').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`am_ban:${sent.id}`).setLabel('Ban').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`am_ignore:${sent.id}`).setLabel('Ignore').setStyle(ButtonStyle.Secondary)
    );

    await sent.edit({ components: [row] });

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30 * 60 * 1000
    });

    collector.on('collect', async (interaction) => {
      if (!isStaff(interaction.member)) {
        try {
          await interaction.reply({ content: "You don't have permission to use this.", ephemeral: true });
        } catch {}
        return;
      }

      const state = pendingActions.get(sent.id);
      if (!state || state.handled) {
        try {
          await interaction.reply({ content: "This alert has already been handled.", ephemeral: true });
        } catch {}
        return;
      }

      // IGNORE button
      if (interaction.customId === `am_ignore:${sent.id}`) {
        state.handled = true;
        pendingActions.set(sent.id, state);

        const newEmbed = EmbedBuilder.from(embed).setColor(LIGHT_PINK).setFooter({ text: `Ignored by ${interaction.user.tag}` });
        await sent.edit({ embeds: [newEmbed], components: [] });
        await interaction.reply({ content: `Ignored.`, ephemeral: true });
        collector.stop('handled');
        return;
      }

      // WARN button
      if (interaction.customId === `am_warn:${sent.id}`) {
        state.handled = true;
        pendingActions.set(sent.id, state);

        const modal = new ModalBuilder()
          .setCustomId(`am_warn_modal:${sent.id}:${state.targetUserId}`)
          .setTitle('Warn Reason');

        const reasonInput = new TextInputBuilder()
          .setCustomId('warn_reason')
          .setLabel('Reason for warning')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Type the reason and then submit')
          .setMaxLength(1000);

        const row1 = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row1);

        await interaction.showModal(modal);
        return;
      }

      // BAN button
      if (interaction.customId === `am_ban:${sent.id}`) {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`am_ban_confirm:${sent.id}`).setLabel('✅ Confirm Ban').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`am_ban_cancel:${sent.id}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ 
          content: `**Confirm ban of <@${state.targetUserId}>?**\nThis action cannot be undone.`, 
          components: [confirmRow], 
          ephemeral: true 
        });
        return;
      }
    });

    collector.on('end', () => {
      pendingActions.delete(sent.id);
      try { sent.edit({ components: [] }).catch(() => {}); } catch {}
    });

    return sent;
  } catch (err) {
    console.error('[Automod] sendAlert error:', err);
    return null;
  }
}

// MAIN AUTOMOD CHECK
async function checkMessage(message) {
  try {
    // Basic checks
    if (!message.guild || !message.member || message.author.bot) return;
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const guildId = message.guild.id;
    const content = (message.content || '').toLowerCase();
    const words = content.split(/\s+/);

    // Check soft words
    if (this.blacklistCache && this.blacklistCache.has(guildId)) {
      const softWords = this.blacklistCache.get(guildId).soft;

      for (const blacklistedWord of softWords) {
        if (!blacklistedWord) continue;

        for (const messageWord of words) {
          const cleanWord = messageWord.replace(/[^\w\s]/g, '');

          if (cleanWord === blacklistedWord) {
            await message.delete().catch(() => {});
            console.log(`[Automod] Soft word "${blacklistedWord}" triggered by ${message.author.tag}`);
            return;
          }
        }
      }
    }

    // Check hard words
    if (this.blacklistCache && this.blacklistCache.has(guildId)) {
      const hardWords = this.blacklistCache.get(guildId).hard;

      for (const blacklistedWord of hardWords) {
        if (!blacklistedWord) continue;

        for (const messageWord of words) {
          const cleanWord = messageWord.replace(/[^\w\s]/g, '');

          if (cleanWord === blacklistedWord) {
            console.log(`[Automod] Hard word "${blacklistedWord}" triggered by ${message.author.tag}`);

            // Delete message
            await message.delete().catch(() => {});

            // 15 minute timeout
            if (message.member && message.member.moderatable) {
              try {
                await message.member.timeout(15 * 60 * 1000, `Automod: Triggered "${blacklistedWord}"`);
                console.log(`[Automod] ${message.author.tag} timed out for 15 minutes`);
                logModAction(this, guildId, 'AUTOMOD-SYSTEM', message.author.id, 'mute', `Automod: Triggered "${blacklistedWord}"`, '15m');
              } catch (err) {
                console.error(`[Automod] Failed to timeout ${message.author.tag}:`, err.message);
              }
            }

            // Send alert
            await sendAutomodAlert(this, message.guild, message.author, blacklistedWord, message.channel.id);
            return;
          }
        }
      }
    }

    // Check for Discord invites
    const inviteRegex = /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\/[A-Za-z0-9]+/i;
    if (inviteRegex.test(message.content)) {
      await message.delete().catch(() => {});
      console.log(`[Automod] Invite link detected from ${message.author.tag}`);
      await sendAutomodAlert(this, message.guild, message.author, 'Discord Invite Link', message.channel.id);
    }

  } catch (err) {
    console.error('[Automod] checkMessage error:', err);
  }
}

// MODAL HANDLER
async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return;

  try {
    if (interaction.customId.startsWith('am_warn_modal:')) {
      const parts = interaction.customId.split(':');
      if (parts.length < 3) return;

      const messageId = parts[1];
      const targetUserId = parts[2];
      const reason = interaction.fields.getTextInputValue('warn_reason');
      const client = interaction.client;
      const guildId = interaction.guildId;

      // Save warning to database
      client.automodDB.prepare(`INSERT INTO automod_warns (guild_id, user_id, moderator_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)`)
        .run(guildId, targetUserId, interaction.user.id, reason || 'No reason provided', Date.now());

      // Update warn count
      const insert = client.automodDB.prepare(`
        INSERT INTO automod_warn_counts (guild_id, user_id, count)
        VALUES (?, ?, 1)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET count = automod_warn_counts.count + 1
      `);
      insert.run(guildId, targetUserId);

      // Log to modstats - FIXED: This will now properly log
      logModAction(client, guildId, interaction.user.id, targetUserId, 'warn', `AUTOMOD: ${reason || 'No reason provided'}`);

      // Update alert message
      const originalMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
      if (originalMessage && originalMessage.embeds[0]) {
        const newEmbed = EmbedBuilder.from(originalMessage.embeds[0])
          .setColor(LIGHT_PINK)
          .setFooter({ text: `Warned by ${interaction.user.tag}` })
          .addFields({ name: 'Warning Reason', value: reason });

        await originalMessage.edit({ embeds: [newEmbed], components: [] });
      }

      await interaction.reply({ 
        content: `✅ <@${targetUserId}> has been warned. Reason: ${reason}`,
        ephemeral: true 
      });

      // DM the warned user
      try {
        const user = await interaction.client.users.fetch(targetUserId);
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('⚠️ You have been warned')
              .setDescription(`You received a warning in **${interaction.guild.name}**`)
              .addFields(
                { name: 'Reason', value: reason },
                { name: 'Moderator', value: interaction.user.tag }
              )
              .setColor(LIGHT_PINK)
              .setTimestamp()
          ]
        });
      } catch (dmError) {}
    }
  } catch (error) {
    console.error('[Automod] Modal handler error:', error);
    try {
      await interaction.reply({ 
        content: '❌ Failed to process warning.',
        ephemeral: true 
      });
    } catch {}
  }
}

// BAN CONFIRMATION HANDLER
async function handleBanConfirmation(interaction) {
  if (!interaction.isButton()) return;

  try {
    if (interaction.customId.startsWith('am_ban_confirm:')) {
      const parts = interaction.customId.split(':');
      if (parts.length < 2) return;

      const messageId = parts[1];
      const state = pendingActions.get(messageId);
      if (!state) {
        await interaction.reply({ content: 'This ban request has expired.', ephemeral: true });
        return;
      }

      try {
        const guild = await interaction.client.guilds.fetch(state.guildId);
        const member = await guild.members.fetch(state.targetUserId).catch(() => null);

        if (member) {
          const banReason = `Automod alert: ${state.matchedWord}`;
          await member.ban({ reason: banReason });

          // Log to modstats - FIXED: This will now properly log
          logModAction(interaction.client, state.guildId, interaction.user.id, state.targetUserId, 'ban', `AUTOMOD BAN: ${banReason}`);

          // Update alert message
          const originalMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
          if (originalMessage && originalMessage.embeds[0]) {
            const newEmbed = EmbedBuilder.from(originalMessage.embeds[0])
              .setColor(LIGHT_PINK)
              .setFooter({ text: `Banned by ${interaction.user.tag}` });

            await originalMessage.edit({ embeds: [newEmbed], components: [] });
          }

          pendingActions.delete(messageId);
          await interaction.reply({ 
            content: `✅ <@${state.targetUserId}> has been banned.`,
            ephemeral: true 
          });
        } else {
          await interaction.reply({ 
            content: '❌ User not found in server.',
            ephemeral: true 
          });
        }
      } catch (banError) {
        console.error('[Automod] Ban error:', banError);
        await interaction.reply({ 
          content: `❌ Failed to ban user: ${banError.message}`,
          ephemeral: true 
        });
      }
    }

    if (interaction.customId.startsWith('am_ban_cancel:')) {
      await interaction.reply({ 
        content: 'Ban cancelled.',
        ephemeral: true 
      });
    }
  } catch (error) {
    console.error('[Automod] Ban handler error:', error);
  }
}

// INIT AUTOMOD
function initAutomod(client) {
  // Ensure databases exist
  if (!client.automodDB) {
    console.error('[Automod] No database available!');
    return false;
  }

  // Ensure modstats table exists
  try {
    client.automodDB.prepare(`
      CREATE TABLE IF NOT EXISTS modstats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        reason TEXT,
        duration TEXT,
        timestamp INTEGER NOT NULL
      )
    `).run();
    console.log('[Automod] Modstats table ensured');
  } catch (error) {
    console.error('[Automod] Failed to create modstats table:', error);
  }

  client.automod = {
    setAutomodChannel: (guildId, channelId) => setAutomodChannel.call(client, guildId, channelId),
    getAutomodChannel: (guildId) => getAutomodChannel.call(client, guildId),
    addAlertTarget: (guildId, type, id) => addAlertTarget.call(client, guildId, type, id),
    removeAlertTarget: (guildId, type, id) => removeAlertTarget.call(client, guildId, type, id),
    listAlertTargets: (guildId) => listAlertTargets.call(client, guildId),
    addHardWord: (guildId, word) => addHardWord.call(client, guildId, word),
    removeHardWord: (guildId, word) => removeHardWord.call(client, guildId, word),
    listHardWords: (guildId) => listHardWords.call(client, guildId),
    addSoftWord: (guildId, word) => addSoftWord.call(client, guildId, word),
    removeSoftWord: (guildId, word) => removeSoftWord.call(client, guildId, word),
    listSoftWords: (guildId) => listSoftWords.call(client, guildId),
    checkMessage: (message) => checkMessage.call(client, message)
  };

  // Setup interaction handlers
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isModalSubmit()) {
        await handleModal(interaction);
        return;
      }

      if (interaction.isButton() && (
        interaction.customId?.startsWith('am_ban_confirm:') || 
        interaction.customId?.startsWith('am_ban_cancel:')
      )) {
        await handleBanConfirmation(interaction);
        return;
      }

      if (interaction.isButton() && interaction.customId?.startsWith('am_')) {
        return;
      }
    } catch (error) {
      console.error('[Automod] Interaction handler error:', error);
    }
  });

  console.log('[Automod] ✅ System initialized with persistent storage');
  return true;
}

// EXPORTS
module.exports = { 
  initAutomod, 
  checkMessage
};