// handlers/automodHandler.js (updated)
// Adds admin immunity + warn counts + auto-ban at 5 warns

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
  ComponentType
} = require('discord.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'automod.sqlite');
const db = new Database(DB_PATH);

// initialize tables (warn history + warn counts + config)
db.prepare(`
CREATE TABLE IF NOT EXISTS automod_channel (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS automod_alert_list (
  guild_id TEXT,
  target_type TEXT, -- 'user' or 'role'
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

// new table: quick counts per user per guild
db.prepare(`
CREATE TABLE IF NOT EXISTS automod_warn_counts (
  guild_id TEXT,
  user_id TEXT,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
)`).run();

// in-memory pending actions: messageId -> state
const pendingActions = new Map();

// helpers: automod config DB functions
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

// blacklist helpers
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

// warns helpers
function saveWarnRaw(guildId, userId, moderatorId, reason) {
  db.prepare(`INSERT INTO automod_warns (guild_id, user_id, moderator_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)`)
    .run(guildId, userId, moderatorId, reason || 'No reason provided', Date.now());
}

// increments counts table and returns new count
function incrementWarnCount(guildId, userId) {
  // try insert, or update
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

// helper: build pretty embed for alert
function buildAlertEmbed(guild, targetUser, matchedWord, requirementRoleId) {
  const embed = new EmbedBuilder()
    .setTitle('「 ✦ 𝐀𝐔𝐓𝐎𝐌𝐎𝐃 𝐀𝐋𝐄𝐑𝐓 ✦ 」')
    .setColor('#f43f5e')
    .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
    .setDescription([
      `➤  **Target:** ${targetUser.tag}`,
      `➤  **Trigger:** \`${matchedWord}\``,
      `➤  **Channel:** ${guild ? `<#${guild.systemChannelId || ''}>` : 'unknown'}`,
      `➤  **Time:** <t:${Math.floor(Date.now() / 1000)}:R>`,
      '',
      `╰┈➤ **__Requirements:__** ${requirementRoleId ? `<@&${requirementRoleId}>` : '\`\`none\`\`'}`,
      '',
      `**Actions:** Use the buttons below to Warn / Ban / Ignore.`
    ].join('\n'));
  return embed;
}

// helper: staff check (keeps as ManageMessages/ModerateMembers/Admin)
function isStaff(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.Administrator);
}

// send automod alert (ghost ping)
async function sendAutomodAlert(client, guild, targetUser, matchedWord, requirementRoleId = null) {
  try {
    const channelId = getAutomodChannel(guild.id);
    if (!channelId) return null;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return null;

    // Build mention content (ghost ping)
    const entries = listAlertTargets(guild.id);
    const mentionUsers = entries.filter(e => e.target_type === 'user').map(e => `<@${e.target_id}>`);
    const mentionRoles = entries.filter(e => e.target_type === 'role').map(e => `<@&${e.target_id}>`);
    const allMentions = [...mentionRoles, ...mentionUsers].join(' ');

    const embed = buildAlertEmbed(guild, targetUser, matchedWord, requirementRoleId);

    // send the message with mentions, then wipe content (ghost ping)
    const sent = await channel.send({ content: allMentions || '\u200b', embeds: [embed] });

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

    // quick clear content to hide mentions (let ping deliver)
    setTimeout(() => {
      try { sent.edit({ content: '\u200b' }); } catch {}
    }, 1200);

    // collector for 30 mins
    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30 * 60 * 1000
    });

    collector.on('collect', async (interaction) => {
      const custom = interaction.customId;
      const member = interaction.member;

      if (!isStaff(member)) {
        await interaction.reply({ content: "you aint important enough brochacho😹", ephemeral: true });
        return;
      }

      const state = pendingActions.get(sent.id);
      if (!state || state.handled) {
        await interaction.reply({ content: "This alert has already been handled.", ephemeral: true });
        return;
      }

      // IGNORE
      if (custom === `am_ignore:${sent.id}`) {
        state.handled = true;
        pendingActions.set(sent.id, state);
        const newEmbed = EmbedBuilder.from(embed).setColor('#94a3b8').setFooter({ text: `Ignored by ${interaction.user.tag}` });
        await sent.edit({ embeds: [newEmbed], components: [] });
        await interaction.reply({ content: `Ignored.`, ephemeral: true });
        collector.stop('handled');
        return;
      }

      // WARN -> open modal for reason (only first click)
      if (custom === `am_warn:${sent.id}`) {
        state.handled = true; // reserve the action so others can't take it
        pendingActions.set(sent.id, state);

        const modal = new ModalBuilder()
          .setCustomId(`am_warn_modal:${sent.id}`)
          .setTitle('Warn Reason');

        const reasonInput = new TextInputBuilder()
          .setCustomId('warn_reason')
          .setLabel('Reason for warning')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Type the reason and then submit');

        const row1 = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row1);

        await interaction.showModal(modal);
        return;
      }

      // BAN -> ephemeral confirm
      if (custom === `am_ban:${sent.id}`) {
        // show ephemeral confirmation with 2 buttons
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`am_ban_confirm:${sent.id}`).setLabel('Confirm Ban').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`am_ban_cancel:${sent.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: `Confirm ban of <@${state.targetUserId}>? (Only first click counts)`, components: [confirmRow], ephemeral: true });
        return;
      }
    });

    collector.on('end', () => {
      pendingActions.delete(sent.id);
      try { sent.edit({ components: [] }); } catch {}
    });

    return sent;
  } catch (err) {
    console.error('sendAutomodAlert error', err);
    return null;
  }
}

// Initialize automod and hook modal/button handlers
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
    getWarnCount
  };

  // INTERACTIONS: modal submit + ban confirm
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isModalSubmit()) {
        const custom = interaction.customId;
        if (custom && custom.startsWith('am_warn_modal:')) {
          const msgId = custom.split(':')[1];
          const reason = interaction.fields.getTextInputValue('warn_reason').slice(0, 1000);
          const state = pendingActions.get(msgId);
          if (!state) {
            await interaction.reply({ content: 'This alert is no longer available.', ephemeral: true });
            return;
          }

          // persist warn history
          saveWarnRaw(state.guildId, state.targetUserId, interaction.user.id, reason);
          // increment count & get new count
          const newCount = incrementWarnCount(state.guildId, state.targetUserId);

          // edit original alert embed to reflect warned & who warned
          const channelId = getAutomodChannel(state.guildId);
          const channel = await client.channels.fetch(channelId).catch(() => null);
          if (channel) {
            const msg = await channel.messages.fetch(msgId).catch(() => null);
            if (msg) {
              const oldEmbed = msg.embeds[0];
              const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#f59e0b').setFooter({ text: `Warned by ${interaction.user.tag} — total warns: ${newCount}` });
              await msg.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
            }
          }

          pendingActions.delete(msgId);

          // notify the moderator (ephemeral)
          await interaction.reply({ content: `User warned and reason saved. Total warns: ${newCount}`, ephemeral: true });

          // Auto-ban at threshold (5)
          const BAN_THRESHOLD = 5;
          if (newCount >= BAN_THRESHOLD) {
            try {
              const guild = client.guilds.cache.get(state.guildId) || await client.guilds.fetch(state.guildId);
              const member = await guild.members.fetch(state.targetUserId).catch(() => null);
              if (member) {
                await member.ban({ reason: `Automod auto-ban after ${newCount} warns (triggered by ${interaction.user.tag})` });
                // edit original alert embed to show banned
                if (channel) {
                  const msg = await channel.messages.fetch(msgId).catch(() => null);
                  if (msg) {
                    const oldEmbed = msg.embeds[0];
                    const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#ef4444').setFooter({ text: `Auto-banned after ${newCount} warns` });
                    await msg.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
                  }
                }
                // optional: clear warn counts record or keep for audit — we'll keep for history
              }
            } catch (err) {
              console.error('Auto-ban error:', err);
            }
          }

          return;
        }
      }

      // Button interactions (ban confirm/cancel)
      if (interaction.isButton()) {
        const id = interaction.customId;
        if (id.startsWith('am_ban_confirm:')) {
          const msgId = id.split(':')[1];
          const state = pendingActions.get(msgId);
          if (!state) {
            await interaction.update({ content: 'Alert expired.', components: [], ephemeral: true }).catch(() => {});
            return;
          }
          try {
            const guild = client.guilds.cache.get(state.guildId) || await client.guilds.fetch(state.guildId);
            const member = await guild.members.fetch(state.targetUserId).catch(() => null);
            if (!member) {
              await interaction.update({ content: 'Could not find the user in the guild.', components: [], ephemeral: true });
              pendingActions.delete(msgId);
              return;
            }
            await member.ban({ reason: `Automod ban by ${interaction.user.tag} (via alert)` });
            // edit alert embed
            const channelId = getAutomodChannel(state.guildId);
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel) {
              const msg = await channel.messages.fetch(msgId).catch(() => null);
              if (msg) {
                const oldEmbed = msg.embeds[0];
                const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#ef4444').setFooter({ text: `Banned by ${interaction.user.tag}` });
                await msg.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
              }
            }
            pendingActions.delete(msgId);
            await interaction.update({ content: `User <@${state.targetUserId}> banned.`, components: [], ephemeral: true });
          } catch (err) {
            console.error('Automod ban error:', err);
            await interaction.update({ content: 'Failed to ban — check permissions.', components: [], ephemeral: true }).catch(() => {});
          }
          return;
        }

        if (id.startsWith('am_ban_cancel:')) {
          await interaction.update({ content: 'Ban cancelled.', components: [], ephemeral: true }).catch(() => {});
          return;
        }
      }
    } catch (err) {
      console.error('automod interaction handler error', err);
    }
  });

  // main checkMessage: called from your command handler
  async function checkMessage(client, message) {
    try {
      if (!message.guild) return;
      if (message.author?.bot) return;

      // IMMUNITY: administrators should not trigger automod
      if (message.member && message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

      const guildId = message.guild.id;
      const content = (message.content || '').toLowerCase();

      // soft words: delete quietly (no logs)
      const softWords = listSoftWords(guildId);
      for (const w of softWords) {
        if (!w) continue;
        if (content.includes(w.toLowerCase())) {
          await message.delete().catch(() => {});
          return; // done
        }
      }

      // hard words: delete + send alert
      const hardWords = listHardWords(guildId);
      for (const w of hardWords) {
        if (!w) continue;
        if (content.includes(w.toLowerCase())) {
          await message.delete().catch(() => {});
          await sendAutomodAlert(client, message.guild, message.author, w, null);
          return;
        }
      }

      // invite links (simple regex)
      const inviteRegex = /(discord\.gg|discordapp\.com\/invite)\/[A-Za-z0-9]+/i;
      if (inviteRegex.test(content)) {
        await message.delete().catch(() => {});
        await sendAutomodAlert(client, message.guild, message.author, 'discord invite', null);
        return;
      }

      // add other filters here...
    } catch (err) {
      console.error('automod check error', err);
    }
  }

  // attach to client
  client.automod = client.automod || {};
  client.automod.checkMessage = checkMessage;
  client.automod._internal = { pendingActions, db };

  console.log('[Automod] Initialized with warn-counts + admin immunity.');
}

module.exports = { initAutomod, db };