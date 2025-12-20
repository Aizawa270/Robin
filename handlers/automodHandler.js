// handlers/automodHandler.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
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

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'automod.sqlite');
const db = new Database(DB_PATH);

// ===== TABLES =====
db.prepare(`
CREATE TABLE IF NOT EXISTS automod_channel (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS automod_alert_list (
  guild_id TEXT,
  target_type TEXT,
  target_id TEXT,
  PRIMARY KEY (guild_id, target_type, target_id)
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS blacklist_hard (
  guild_id TEXT,
  word TEXT,
  PRIMARY KEY (guild_id, word)
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS blacklist_soft (
  guild_id TEXT,
  word TEXT,
  PRIMARY KEY (guild_id, word)
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS automod_warns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  user_id TEXT,
  moderator_id TEXT,
  reason TEXT,
  timestamp INTEGER
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS automod_warn_counts (
  guild_id TEXT,
  user_id TEXT,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
)`).run();

// in-memory pending actions
const pendingActions = new Map();

// ===== HELPERS =====
function setAutomodChannel(guildId, channelId) {
  db.prepare(`INSERT OR REPLACE INTO automod_channel (guild_id, channel_id) VALUES (?, ?)`).run(guildId, channelId);
}

function getAutomodChannel(guildId) {
  const r = db.prepare(`SELECT channel_id FROM automod_channel WHERE guild_id = ?`).get(guildId);
  return r?.channel_id || null;
}

function addAlertTarget(guildId, type, id) {
  db.prepare(`INSERT OR IGNORE INTO automod_alert_list (guild_id, target_type, target_id) VALUES (?, ?, ?)`).run(guildId, type, id);
}

function removeAlertTarget(guildId, type, id) {
  db.prepare(`DELETE FROM automod_alert_list WHERE guild_id = ? AND target_type = ? AND target_id = ?`).run(guildId, type, id);
}

function listAlertTargets(guildId) {
  return db.prepare(`SELECT target_type, target_id FROM automod_alert_list WHERE guild_id = ?`).all(guildId);
}

function addHardWord(guildId, word) {
  db.prepare(`INSERT OR IGNORE INTO blacklist_hard (guild_id, word) VALUES (?, ?)`).run(guildId, word.toLowerCase());
}

function removeHardWord(guildId, word) {
  db.prepare(`DELETE FROM blacklist_hard WHERE guild_id = ? AND word = ?`).run(guildId, word.toLowerCase());
}

function listHardWords(guildId) {
  return db.prepare(`SELECT word FROM blacklist_hard WHERE guild_id = ?`).all(guildId).map(r => r.word);
}

function addSoftWord(guildId, word) {
  db.prepare(`INSERT OR IGNORE INTO blacklist_soft (guild_id, word) VALUES (?, ?)`).run(guildId, word.toLowerCase());
}

function removeSoftWord(guildId, word) {
  db.prepare(`DELETE FROM blacklist_soft WHERE guild_id = ? AND word = ?`).run(guildId, word.toLowerCase());
}

function listSoftWords(guildId) {
  return db.prepare(`SELECT word FROM blacklist_soft WHERE guild_id = ?`).all(guildId).map(r => r.word);
}

function saveWarnRaw(guildId, userId, moderatorId, reason) {
  db.prepare(`INSERT INTO automod_warns (guild_id, user_id, moderator_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)`)
    .run(guildId, userId, moderatorId, reason || 'No reason provided', Date.now());
}

function incrementWarnCount(guildId, userId) {
  const insert = db.prepare(`
    INSERT INTO automod_warn_counts (guild_id, user_id, count)
    VALUES (?, ?, 1)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET count = automod_warn_counts.count + 1
  `);
  insert.run(guildId, userId);
  const row = db.prepare(`SELECT count FROM automod_warn_counts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
  return row?.count || 0;
}

function getWarnCount(guildId, userId) {
  const row = db.prepare(`SELECT count FROM automod_warn_counts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId);
  return row?.count || 0;
}

function listWarns(guildId, userId) {
  return db.prepare(`SELECT moderator_id, reason, timestamp FROM automod_warns WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC`).all(guildId, userId);
}

// ===== ALERT EMBED =====
function buildAlertEmbed(guild, targetUser, matchedWord, requirementRoleId, channelId) {
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

// ===== SEND ALERT =====
async function sendAutomodAlert(client, guild, targetUser, matchedWord, requirementRoleId = null, channelId = null) {
  try {
    const alertChannelId = getAutomodChannel(guild.id);
    if (!alertChannelId) {
      console.log(`[Automod] No alert channel set for guild ${guild.id}`);
      return null;
    }

    const channel = await client.channels.fetch(alertChannelId).catch(() => null);
    if (!channel) {
      console.log(`[Automod] Could not find channel ${alertChannelId} in guild ${guild.id}`);
      return null;
    }

    const entries = listAlertTargets(guild.id);
    const mentionUsers = entries.filter(e => e.target_type === 'user').map(e => `<@${e.target_id}>`);
    const mentionRoles = entries.filter(e => e.target_type === 'role').map(e => `<@&${e.target_id}>`);
    const allMentions = [...mentionRoles, ...mentionUsers].join(' ');

    const embed = buildAlertEmbed(guild, targetUser, matchedWord, requirementRoleId, channelId);

    const sent = await channel.send({ content: allMentions || '\u200b', embeds: [embed] });
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

    setTimeout(() => {
      try { sent.edit({ content: '\u200b' }); } catch {}
    }, 1200);

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30 * 60 * 1000
    });

    // ===== FIXED BUTTON HANDLER - NO CRASHES =====
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
          
          // Update embed to show ignored
          const newEmbed = EmbedBuilder.from(embed).setColor('#94a3b8').setFooter({ text: `Ignored by ${interaction.user.tag}` });
          await sent.edit({ embeds: [newEmbed], components: [] });
          
          // Send confirmation
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

          // Create modal for warning reason
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

          // Show the modal - NO defer, just show it
          await interaction.showModal(modal);
          
        } catch (error) {
          console.error('[Automod] Warn button error:', error.message);
          // If modal fails, send error message
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
async function checkMessage(client, message) {
  try {
    // Basic checks
    if (!message.guild) return;
    if (!message.member) return;
    if (message.author.bot) return;

    // ADMIN BYPASS - FIXED
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }

    const guildId = message.guild.id;
    const content = (message.content || '').toLowerCase();

    // Check soft words (delete only)
    const softWords = listSoftWords(guildId);
    for (const word of softWords) {
      if (word && content.includes(word.toLowerCase())) {
        await message.delete().catch(() => {});
        console.log(`[Automod] Soft word "${word}" triggered by ${message.author.tag}`);
        return;
      }
    }

    // Check hard words (delete + 15min timeout + alert)
    const hardWords = listHardWords(guildId);
    for (const word of hardWords) {
      if (word && content.includes(word.toLowerCase())) {
        console.log(`[Automod] Hard word "${word}" triggered by ${message.author.tag}`);

        // Delete message
        await message.delete().catch(() => {});

        // 15 MINUTE TIMEOUT (900,000 ms)
        if (message.member && message.member.moderatable) {
          try {
            await message.member.timeout(15 * 60 * 1000, `Automod: Triggered "${word}"`);
            console.log(`[Automod] ${message.author.tag} timed out for 15 minutes`);
          } catch (err) {
            console.error(`[Automod] Failed to timeout ${message.author.tag}:`, err.message);
          }
        }

        // Send alert to channel
        const alertSent = await sendAutomodAlert(client, message.guild, message.author, word, null, message.channel.id);
        if (!alertSent) {
          console.log(`[Automod] Alert failed to send for ${message.author.tag}`);
        }

        return;
      }
    }

    // Check for Discord invites
    const inviteRegex = /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\/[A-Za-z0-9]+/i;
    if (inviteRegex.test(message.content)) {
      await message.delete().catch(() => {});
      console.log(`[Automod] Invite link detected from ${message.author.tag}`);

      await sendAutomodAlert(client, message.guild, message.author, 'Discord Invite Link', null, message.channel.id);
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
      
      // Save the warning
      saveWarnRaw(interaction.guildId, targetUserId, interaction.user.id, reason);
      incrementWarnCount(interaction.guildId, targetUserId);
      
      // Update the alert message
      const originalMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
      if (originalMessage) {
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
          await member.ban({ reason: `Automod alert: ${state.matchedWord}` });
          
          // Update the alert message
          const originalMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
          if (originalMessage) {
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
  client.automodDB = db;
  client.automod = {
    setAutomodChannel,
    getAutomodChannel,
    addAlertTarget,
    removeAlertTarget,
    listAlertTargets,
    addHardWord,
    removeHardWord,
    listHardWords,
    addSoftWord,
    removeSoftWord,
    listSoftWords,
    saveWarn: saveWarnRaw,
    listWarns,
    getWarnCount,
    checkMessage
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

  console.log('[Automod] ✅ System initialized - Admin bypass enabled, 15min timeouts');
  return true;
}

// ===== EXPORTS =====
module.exports = { 
  initAutomod, 
  db,
  checkMessage,
  setAutomodChannel,
  getAutomodChannel,
  addAlertTarget,
  removeAlertTarget,
  listAlertTargets,
  addHardWord,
  removeHardWord,
  listHardWords,
  addSoftWord,
  removeSoftWord,
  listSoftWords,
  saveWarn: saveWarnRaw,
  listWarns,
  getWarnCount
};