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

// in-memory pending actions
const pendingActions = new Map();

// ===== HELPER FUNCTIONS =====
function setAutomodChannel(guildId, channelId) {
  this.automodDB.prepare(`INSERT OR REPLACE INTO automod_channel (guild_id, channel_id) VALUES (?, ?)`).run(guildId, channelId);
  return true;
}

function getAutomodChannel(guildId) {
  const r = this.automodDB.prepare(`SELECT channel_id FROM automod_channel WHERE guild_id = ?`).get(guildId);
  return r?.channel_id || null;
}

function addAlertTarget(guildId, type, id) {
  this.automodDB.prepare(`INSERT OR IGNORE INTO automod_alert_list (guild_id, target_type, target_id) VALUES (?, ?, ?)`).run(guildId, type, id);
  return true;
}

function removeAlertTarget(guildId, type, id) {
  this.automodDB.prepare(`DELETE FROM automod_alert_list WHERE guild_id = ? AND target_type = ? AND target_id = ?`).run(guildId, type, id);
  return true;
}

function listAlertTargets(guildId) {
  return this.automodDB.prepare(`SELECT target_type, target_id FROM automod_alert_list WHERE guild_id = ?`).all(guildId);
}

function addHardWord(guildId, word) {
  const lowerWord = word.toLowerCase();
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
  const lowerWord = word.toLowerCase();
  this.automodDB.prepare(`DELETE FROM blacklist_hard WHERE guild_id = ? AND word = ?`).run(guildId, lowerWord);

  // Update cache
  if (this.blacklistCache.has(guildId)) {
    const cache = this.blacklistCache.get(guildId);
    cache.hard = cache.hard.filter(w => w !== lowerWord);
  }

  return true;
}

function listHardWords(guildId) {
  // Use cache if available
  if (this.blacklistCache && this.blacklistCache.has(guildId)) {
    return this.blacklistCache.get(guildId).hard;
  }
  // Fallback to database
  return this.automodDB.prepare(`SELECT word FROM blacklist_hard WHERE guild_id = ?`).all(guildId).map(r => r.word);
}

function addSoftWord(guildId, word) {
  const lowerWord = word.toLowerCase();
  this.automodDB.prepare(`INSERT OR IGNORE INTO blacklist_soft (guild_id, word) VALUES (?, ?)`).run(guildId, lowerWord);

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
  const lowerWord = word.toLowerCase();
  this.automodDB.prepare(`DELETE FROM blacklist_soft WHERE guild_id = ? AND word = ?`).run(guildId, lowerWord);

  // Update cache
  if (this.blacklistCache.has(guildId)) {
    const cache = this.blacklistCache.get(guildId);
    cache.soft = cache.soft.filter(w => w !== lowerWord);
  }

  return true;
}

function listSoftWords(guildId) {
  // Use cache if available
  if (this.blacklistCache && this.blacklistCache.has(guildId)) {
    return this.blacklistCache.get(guildId).soft;
  }
  // Fallback to database
  return this.automodDB.prepare(`SELECT word FROM blacklist_soft WHERE guild_id = ?`).all(guildId).map(r => r.word);
}

// ===== ALERT EMBED =====
function buildAlertEmbed(guild, targetUser, matchedWord, channelId) {
  const embed = new EmbedBuilder()
    .setTitle('「 ✦ 𝐀𝐔𝐓𝐎𝐌𝐎𝐃 𝐀𝐋𝐄𝐑𝐓 ✦ 」')
    .setColor('#f43f5e')
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

// ===== STAFF CHECK =====
function isStaff(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageMessages) ||
         member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
         member.permissions.has(PermissionFlagsBits.Administrator);
}

// ===== MODSTATS LOGGING HELPER =====
function logModAction(client, guildId, moderatorId, targetId, actionType, reason, duration = null) {
  try {
    if (!client.modstatsDB) {
      console.error('[ModStats] Database not available');
      return false;
    }

    const timestamp = Date.now();
    const stmt = client.modstatsDB.prepare(
      'INSERT INTO modstats (guild_id, moderator_id, target_id, action_type, reason, duration, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    
    stmt.run(guildId, moderatorId, targetId, actionType, reason || 'No reason provided', duration, timestamp);
    
    console.log(`[ModStats] Logged ${actionType} by ${moderatorId} on ${targetId}`);
    return true;
  } catch (error) {
    console.error('[ModStats] Failed to log action:', error);
    return false;
  }
}

// ===== SEND ALERT =====
async function sendAutomodAlert(client, guild, targetUser, matchedWord, channelId = null) {
  try {
    const alertChannelId = getAutomodChannel.call(client, guild.id);
    if (!alertChannelId) {
      console.log(`[Automod] No alert channel set for guild ${guild.id}`);
      return null;
    }

    const channel = await client.channels.fetch(alertChannelId).catch(() => null);
    if (!channel) {
      console.log(`[Automod] Could not find channel ${alertChannelId} in guild ${guild.id}`);
      return null;
    }

    const entries = listAlertTargets.call(client, guild.id);
    const mentionUsers = entries.filter(e => e.target_type === 'user').map(e => `<@${e.target_id}>`);
    const mentionRoles = entries.filter(e => e.target_type === 'role').map(e => `<@&${e.target_id}>`);
    const allMentions = [...mentionRoles, ...mentionUsers].join(' ');

    // 🔹 GHOST PING: Send mention then delete it
    if (allMentions.trim()) {
      try {
        const pingMessage = await channel.send({ 
          content: allMentions,
          allowedMentions: { parse: ['users', 'roles'] }
        });
        
        // Delete the ping message after 100ms (ghost ping)
        setTimeout(() => {
          pingMessage.delete().catch(() => {});
        }, 100);
      } catch (pingError) {
        console.log('[Automod] Failed to send ghost ping:', pingError.message);
      }
    }

    const embed = buildAlertEmbed(guild, targetUser, matchedWord, channelId);

    // Send embed without mentions (ghost ping already sent)
    const sent = await channel.send({ embeds: [embed] });
    console.log(`[Automod] Alert sent to ${channel.name} for ${targetUser.tag}`);

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

    // Button handler
    collector.on('collect', async (interaction) => {
      const custom = interaction.customId;
      const member = interaction.member;

      // Check if user is staff
      if (!isStaff(member)) {
        try {
          await interaction.reply({ content: "you aint important enough brochacho😹", ephemeral: true });
        } catch (err) {
          console.log('[Automod] Could not reply to non-staff:', err.message);
        }
        return;
      }

      // Get alert state
      const state = pendingActions.get(sent.id);
      if (!state || state.handled) {
        try {
          await interaction.reply({ content: "This alert has already been handled.", ephemeral: true });
        } catch (err) {
          console.log('[Automod] Could not reply to handled alert:', err.message);
        }
        return;
      }

      // Handle IGNORE button
      if (custom === `am_ignore:${sent.id}`) {
        try {
          state.handled = true;
          pendingActions.set(sent.id, state);

          const newEmbed = EmbedBuilder.from(embed).setColor('#94a3b8').setFooter({ text: `Ignored by ${interaction.user.tag}` });
          await sent.edit({ embeds: [newEmbed], components: [] });

          await interaction.reply({ content: `Ignored.`, ephemeral: true });
          collector.stop('handled');
        } catch (err) {
          console.error('[Automod] Ignore button error:', err.message);
        }
        return;
      }

      // Handle WARN button (MODAL)
      if (custom === `am_warn:${sent.id}`) {
        try {
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
        } catch (error) {
          console.error('[Automod] Warn button error:', error.message);
          try {
            await interaction.reply({ 
              content: 'Could not open warning menu. Please try again.', 
              ephemeral: true 
            });
          } catch {}
        }
        return;
      }

      // Handle BAN button (confirmation)
      if (custom === `am_ban:${sent.id}`) {
        try {
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`am_ban_confirm:${sent.id}`).setLabel('✅ Confirm Ban').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`am_ban_cancel:${sent.id}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
          );

          await interaction.reply({ 
            content: `**Confirm ban of <@${state.targetUserId}>?**\nThis action cannot be undone.`, 
            components: [confirmRow], 
            ephemeral: true 
          });
        } catch (err) {
          console.error('[Automod] Ban button error:', err.message);
        }
        return;
      }
    });

    collector.on('end', () => {
      pendingActions.delete(sent.id);
      try { 
        sent.edit({ components: [] }).catch(() => {}); 
      } catch {}
    });

    return sent;
  } catch (err) {
    console.error('[Automod] sendAlert error:', err);
    return null;
  }
}

// ===== MAIN AUTOMOD CHECK =====
async function checkMessage(message) {
  try {
    // Basic checks
    if (!message.guild) return;
    if (!message.member) return;
    if (message.author.bot) return;

    // ADMIN BYPASS
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }

    const guildId = message.guild.id;
    const content = (message.content || '').toLowerCase();

    
// Check soft words (delete only) - using cache with word boundaries
if (this.blacklistCache && this.blacklistCache.has(guildId)) {
  const softWords = this.blacklistCache.get(guildId).soft;
  for (const word of softWords) {
    if (word) {
      // Use regex with word boundary to match whole words only
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(content)) {
        await message.delete().catch(() => {});
        console.log(`[Automod] Soft word "${word}" triggered by ${message.author.tag}`);
        return;
      }
    }
  }
}

// Check hard words (delete + 15min timeout + alert) - using cache with word boundaries
if (this.blacklistCache && this.blacklistCache.has(guildId)) {
  const hardWords = this.blacklistCache.get(guildId).hard;
  for (const word of hardWords) {
    if (word) {
      // Use regex with word boundary to match whole words only
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(content)) {
        console.log(`[Automod] Hard word "${word}" triggered by ${message.author.tag}`);

        // Delete message
        await message.delete().catch(() => {});

        // 15 MINUTE TIMEOUT (900,000 ms)
        if (message.member && message.member.moderatable) {
          try {
            await message.member.timeout(15 * 60 * 1000, `Automod: Triggered "${word}"`);
            console.log(`[Automod] ${message.author.tag} timed out for 15 minutes`);

            // 🔹 Log mute to modstats (automod timeout)
            logModAction(this, guildId, 'AUTOMOD-SYSTEM', message.author.id, 'mute', `Automod: Triggered "${word}"`, '15m');
          } catch (err) {
            console.error(`[Automod] Failed to timeout ${message.author.tag}:`, err.message);
          }
        }

        // Send alert to channel
        const alertSent = await sendAutomodAlert(this, message.guild, message.author, word, message.channel.id);
        if (!alertSent) {
          console.log(`[Automod] Alert failed to send for ${message.author.tag}`);
        }

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

// ===== MODAL HANDLER =====
async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return;

  try {
    const customId = interaction.customId;

    // Check if it's a warn modal
    if (customId.startsWith('am_warn_modal:')) {
      const parts = customId.split(':');
      if (parts.length < 3) return;

      const messageId = parts[1];
      const targetUserId = parts[2];
      const reason = interaction.fields.getTextInputValue('warn_reason');

      const client = interaction.client;
      const guildId = interaction.guildId;

      // Save the warning to database
      client.automodDB.prepare(`INSERT INTO automod_warns (guild_id, user_id, moderator_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)`)
        .run(guildId, targetUserId, interaction.user.id, reason || 'No reason provided', Date.now());

      // Update warn count
      const insert = client.automodDB.prepare(`
        INSERT INTO automod_warn_counts (guild_id, user_id, count)
        VALUES (?, ?, 1)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET count = automod_warn_counts.count + 1
      `);
      insert.run(guildId, targetUserId);

      // 🔹 Log automod warn to modstats
      logModAction(client, guildId, interaction.user.id, targetUserId, 'warn', `AUTOMOD: ${reason || 'No reason provided'}`);

      // Update the alert message
      const originalMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
      if (originalMessage && originalMessage.embeds[0]) {
        const newEmbed = EmbedBuilder.from(originalMessage.embeds[0])
          .setColor('#f59e0b')
          .setFooter({ text: `Warned by ${interaction.user.tag}` })
          .addFields({ name: 'Warning Reason', value: reason });

        await originalMessage.edit({ embeds: [newEmbed], components: [] });
      }

      // Confirm to moderator
      await interaction.reply({ 
        content: `✅ <@${targetUserId}> has been warned. Reason: ${reason}`,
        ephemeral: true 
      });

      // Notify the warned user if possible
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
              .setColor('#f59e0b')
              .setTimestamp()
          ]
        });
      } catch (dmError) {
        console.log('[Automod] Could not DM warned user:', dmError.message);
      }
    }
  } catch (error) {
    console.error('[Automod] Modal handler error:', error);
    try {
      await interaction.reply({ 
        content: '❌ Failed to process warning. Check console for error.',
        ephemeral: true 
      });
    } catch {}
  }
}

// ===== BAN CONFIRMATION HANDLER =====
async function handleBanConfirmation(interaction) {
  if (!interaction.isButton()) return;

  try {
    const customId = interaction.customId;

    // Check if it's a ban confirmation
    if (customId.startsWith('am_ban_confirm:')) {
      const parts = customId.split(':');
      if (parts.length < 2) return;

      const messageId = parts[1];

      // Find the alert in pending actions
      const state = pendingActions.get(messageId);
      if (!state) {
        await interaction.reply({ content: 'This ban request has expired.', ephemeral: true });
        return;
      }

      // Ban the user
      try {
        const guild = await interaction.client.guilds.fetch(state.guildId);
        const member = await guild.members.fetch(state.targetUserId).catch(() => null);

        if (member) {
          const banReason = `Automod alert: ${state.matchedWord}`;
          await member.ban({ reason: banReason });

          // 🔹 Log automod ban to modstats
          logModAction(interaction.client, state.guildId, interaction.user.id, state.targetUserId, 'ban', `AUTOMOD BAN: ${banReason}`);

          // Update the alert message
          const originalMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
          if (originalMessage && originalMessage.embeds[0]) {
            const newEmbed = EmbedBuilder.from(originalMessage.embeds[0])
              .setColor('#ef4444')
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

    // Handle ban cancel
    if (customId.startsWith('am_ban_cancel:')) {
      await interaction.reply({ 
        content: 'Ban cancelled.',
        ephemeral: true 
      });
    }
  } catch (error) {
    console.error('[Automod] Ban handler error:', error);
    try {
      await interaction.reply({ 
        content: '❌ Failed to process ban.',
        ephemeral: true 
      });
    } catch {}
  }
}

// ===== INIT AUTOMOD =====
function initAutomod(client) {
  // Attach automod functions to client
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
      // Handle modals (warnings)
      if (interaction.isModalSubmit()) {
        await handleModal(interaction);
        return;
      }

      // Handle ban confirm/cancel buttons
      if (interaction.isButton() && (
        interaction.customId?.startsWith('am_ban_confirm:') || 
        interaction.customId?.startsWith('am_ban_cancel:')
      )) {
        await handleBanConfirmation(interaction);
        return;
      }

      // Ignore other automod buttons (handled in collector)
      if (interaction.isButton() && interaction.customId?.startsWith('am_')) {
        return;
      }
    } catch (error) {
      console.error('[Automod] Interaction handler error:', error);
    }
  });

  console.log('[Automod] ✅ System initialized with SQLite persistence');
  return true;
}

// ===== EXPORTS =====
module.exports = { 
  initAutomod, 
  checkMessage
};