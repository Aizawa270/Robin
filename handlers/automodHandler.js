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
  ComponentType
} = require('discord.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'automod.sqlite');
const db = new Database(DB_PATH);

// initialize tables
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

// In-memory state for live pending actions: alertMessageId -> state
const pendingActions = new Map();

// ===== DB helpers =====
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

function saveWarn(guildId, userId, moderatorId, reason) {
  db.prepare(`INSERT INTO automod_warns (guild_id, user_id, moderator_id, reason, timestamp) VALUES (?, ?, ?, ?, ?)`)
    .run(guildId, userId, moderatorId, reason || 'No reason provided', Date.now());
}
function listWarnsDB(guildId, userId) {
  return db.prepare(`SELECT moderator_id, reason, timestamp FROM automod_warns WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC`).all(guildId, userId);
}

// ===== helpers =====
function isStaff(member) {
  if (!member) return false;
  try {
    return member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
      member.permissions.has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

function buildAlertEmbed(originChannelId, guild, targetUser, matchedWord, requirementRoleId) {
  const embed = new EmbedBuilder()
    .setTitle('「 ✦ 𝐀𝐔𝐓𝐎𝐌𝐎𝐃 𝐀𝐋𝐄𝐑𝐓 ✦ 」')
    .setColor('#f43f5e')
    .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
    .setDescription([
      `➤  **Target:** ${targetUser.tag}`,
      `➤  **Trigger:** \`${matchedWord}\``,
      `➤  **Channel:** ${originChannelId ? `<#${originChannelId}>` : 'Unknown'}`,
      `➤  **Time:** <t:${Math.floor(Date.now() / 1000)}:R>`,
      '',
      `╰┈➤ **__Requirements:__** ${requirementRoleId ? `<@&${requirementRoleId}>` : '\`\`none\`\`'}`,
      '',
      `**Actions:** Use the buttons below to Warn / Ban / Ignore.`
    ].join('\n'))
    .setFooter({ text: 'First staff to act will take the action' });
  return embed;
}

// ===== sendAutomodAlert =====
async function sendAutomodAlert(client, guild, originChannelId, targetUser, matchedWord, requirementRoleId = null) {
  try {
    const channelId = getAutomodChannel(guild.id);
    if (!channelId) return null;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return null;

    // Build list of mentions (users & roles) so they receive the ghost ping
    const entries = listAlertTargets(guild.id);
    const mentionRoles = entries.filter(e => e.target_type === 'role').map(e => `<@&${e.target_id}>`);
    const mentionUsers = entries.filter(e => e.target_type === 'user').map(e => `<@${e.target_id}>`);
    const allMentions = [...mentionRoles, ...mentionUsers].join(' ');

    const embed = buildAlertEmbed(originChannelId, guild, targetUser, matchedWord, requirementRoleId);

    // Send message with mentions visible to trigger ghost ping, then remove content quickly
    const sent = await channel.send({ content: allMentions || '\u200b', embeds: [embed] });

    // Save pending state keyed by alert message id
    pendingActions.set(sent.id, {
      guildId: guild.id,
      targetUserId: targetUser.id,
      matchedWord,
      originChannelId,
      handled: false,
      alertMessageId: sent.id
    });

    // Buttons row
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`am_warn:${sent.id}`).setLabel('Warn').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`am_ban:${sent.id}`).setLabel('Ban').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`am_ignore:${sent.id}`).setLabel('Ignore').setStyle(ButtonStyle.Secondary)
    );

    // edit to add buttons (or you can send with components directly)
    await sent.edit({ components: [row] }).catch(() => {});

    // remove visible mentions shortly after (ghost ping delivered)
    setTimeout(() => {
      try { sent.edit({ content: '\u200b' }).catch(() => {}); } catch {}
    }, 1200);

    // Collector to ensure first-staff behavior — will be handled in initAutomod's interactionCreate as well
    // Keep collector just to auto-clean after timeout
    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30 * 60 * 1000 });
    collector.on('end', () => {
      // If still pending and not handled, remove components
      const state = pendingActions.get(sent.id);
      pendingActions.delete(sent.id);
      try { sent.edit({ components: [] }).catch(() => {}); } catch {}
    });

    return sent;
  } catch (err) {
    console.error('sendAutomodAlert error:', err);
    return null;
  }
}

// ===== checkMessage (exported) =====
async function checkMessage(client, message) {
  try {
    if (!message.guild) return false;
    if (message.author?.bot) return false;

    const guildId = message.guild.id;
    const content = (message.content || '').toLowerCase();

    // soft words (silent delete)
    const softWords = listSoftWords(guildId);
    for (const w of softWords) {
      if (!w) continue;
      if (content.includes(w.toLowerCase())) {
        await message.delete().catch(() => {});
        return { acted: true, type: 'soft' };
      }
    }

    // hard words -> delete + alert
    const hardWords = listHardWords(guildId);
    for (const w of hardWords) {
      if (!w) continue;
      if (content.includes(w.toLowerCase())) {
        await message.delete().catch(() => {});
        await sendAutomodAlert(client, message.guild, message.channel.id, message.author, w, null);
        return { acted: true, type: 'hard', word: w };
      }
    }

    // discord invite detection (basic)
    const inviteRegex = /(discord\.gg|discordapp\.com\/invite)\/[A-Za-z0-9]+/i;
    if (inviteRegex.test(content)) {
      await message.delete().catch(() => {});
      await sendAutomodAlert(client, message.guild, message.channel.id, message.author, 'discord invite', null);
      return { acted: true, type: 'invite' };
    }

    // no action
    return { acted: false };
  } catch (err) {
    console.error('automod check error', err);
    return { acted: false, error: err };
  }
}

// ===== initAutomod: attach interaction handlers (modals & ban confirm) =====
function initAutomod(client) {
  // expose helper methods via client.automod
  client.automod = client.automod || {};
  client.automod.db = db;
  client.automod.setAutomodChannel = setAutomodChannel;
  client.automod.getAutomodChannel = getAutomodChannel;
  client.automod.addAlertTarget = addAlertTarget;
  client.automod.removeAlertTarget = removeAlertTarget;
  client.automod.listAlertTargets = listAlertTargets;
  client.automod.addHardWord = addHardWord;
  client.automod.removeHardWord = removeHardWord;
  client.automod.listHardWords = listHardWords;
  client.automod.addSoftWord = addSoftWord;
  client.automod.removeSoftWord = removeSoftWord;
  client.automod.listSoftWords = listSoftWords;
  client.automod.saveWarn = saveWarn;
  client.automod.listWarns = listWarnsDB;

  client.on('interactionCreate', async (interaction) => {
    try {
      // Modal submit (warn reason)
      if (interaction.isModalSubmit()) {
        const custom = interaction.customId;
        if (custom?.startsWith('am_warn_modal:')) {
          const msgId = custom.split(':')[1];
          const state = pendingActions.get(msgId);
          if (!state) {
            await interaction.reply({ content: 'This alert is no longer available.', ephemeral: true }).catch(() => {});
            return;
          }
          const reason = interaction.fields.getTextInputValue('warn_reason').slice(0, 1000);
          saveWarn(state.guildId, state.targetUserId, interaction.user.id, reason);

          // update original alert embed
          const channelId = getAutomodChannel(state.guildId);
          const channel = await client.channels.fetch(channelId).catch(() => null);
          if (channel) {
            const msg = await channel.messages.fetch(msgId).catch(() => null);
            if (msg) {
              const oldEmbed = msg.embeds[0];
              const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#f59e0b').setFooter({ text: `Warned by ${interaction.user.tag}` });
              await msg.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
            }
          }

          pendingActions.delete(msgId);
          await interaction.reply({ content: 'User warned and reason saved.', ephemeral: true }).catch(() => {});
        }
        return;
      }

      // Button interactions
      if (interaction.isButton()) {
        const id = interaction.customId;
        // warn button pressed
        if (id.startsWith('am_warn:')) {
          const msgId = id.split(':')[1];
          const state = pendingActions.get(msgId);
          if (!state) {
            await interaction.reply({ content: 'This alert expired.', ephemeral: true }).catch(() => {});
            return;
          }
          if (!isStaff(interaction.member)) {
            await interaction.reply({ content: "you aint important enough brochacho😹", ephemeral: true }).catch(() => {});
            return;
          }
          if (state.handled) {
            await interaction.reply({ content: 'Already handled.', ephemeral: true }).catch(() => {});
            return;
          }
          // reserve and open modal
          state.handled = true;
          pendingActions.set(msgId, state);
          const modal = new ModalBuilder().setCustomId(`am_warn_modal:${msgId}`).setTitle('Warn Reason');
          const reasonInput = new TextInputBuilder()
            .setCustomId('warn_reason')
            .setLabel('Reason for warning')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('Type the reason and then submit');
          const row1 = new ActionRowBuilder().addComponents(reasonInput);
          modal.addComponents(row1);
          await interaction.showModal(modal).catch(() => {});
          return;
        }

        // ban button pressed -> ask for confirmation ephemeral
        if (id.startsWith('am_ban:')) {
          const msgId = id.split(':')[1];
          const state = pendingActions.get(msgId);
          if (!state) {
            await interaction.reply({ content: 'This alert expired.', ephemeral: true }).catch(() => {});
            return;
          }
          if (!isStaff(interaction.member)) {
            await interaction.reply({ content: "you aint important enough brochacho😹", ephemeral: true }).catch(() => {});
            return;
          }
          if (state.handled) {
            await interaction.reply({ content: 'Already handled.', ephemeral: true }).catch(() => {});
            return;
          }
          // show confirm buttons ephemeral
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`am_ban_confirm:${msgId}`).setLabel('Confirm Ban').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`am_ban_cancel:${msgId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
          );
          await interaction.reply({ content: `Confirm ban of <@${state.targetUserId}>? (Only first click counts)`, components: [confirmRow], ephemeral: true }).catch(() => {});
          return;
        }

        // ban confirm
        if (id.startsWith('am_ban_confirm:')) {
          const msgId = id.split(':')[1];
          const state = pendingActions.get(msgId);
          if (!state) {
            await interaction.update({ content: 'Alert expired.', components: [], ephemeral: true }).catch(() => {});
            return;
          }
          // final permission check
          if (!isStaff(interaction.member)) {
            await interaction.update({ content: "you aint important enough brochacho😹", components: [], ephemeral: true }).catch(() => {});
            return;
          }
          try {
            const guild = client.guilds.cache.get(state.guildId) || await client.guilds.fetch(state.guildId);
            const member = await guild.members.fetch(state.targetUserId).catch(() => null);
            if (!member) {
              await interaction.update({ content: 'Could not find the user in the guild.', components: [], ephemeral: true }).catch(() => {});
              pendingActions.delete(msgId);
              return;
            }
            await member.ban({ reason: `Automod ban by ${interaction.user.tag} (via alert)` });
            // edit original alert embed
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
            await interaction.update({ content: `User <@${state.targetUserId}> banned.`, components: [], ephemeral: true }).catch(() => {});
          } catch (err) {
            console.error('Automod ban error:', err);
            await interaction.update({ content: 'Failed to ban — check permissions.', components: [], ephemeral: true }).catch(() => {});
          }
          return;
        }

        // ban cancel
        if (id.startsWith('am_ban_cancel:')) {
          await interaction.update({ content: 'Ban cancelled.', components: [], ephemeral: true }).catch(() => {});
          return;
        }

        // ignore button (if pressed directly)
        if (id.startsWith('am_ignore:')) {
          const msgId = id.split(':')[1];
          const state = pendingActions.get(msgId);
          if (!state) {
            await interaction.reply({ content: 'Alert expired.', ephemeral: true }).catch(() => {});
            return;
          }
          if (!isStaff(interaction.member)) {
            await interaction.reply({ content: "you aint important enough brochacho😹", ephemeral: true }).catch(() => {});
            return;
          }
          // mark as ignored and edit embed
          pendingActions.delete(msgId);
          const channelId = getAutomodChannel(state.guildId);
          const channel = await client.channels.fetch(channelId).catch(() => null);
          if (channel) {
            const msg = await channel.messages.fetch(msgId).catch(() => null);
            if (msg) {
              const oldEmbed = msg.embeds[0];
              const newEmbed = EmbedBuilder.from(oldEmbed).setColor('#94a3b8').setFooter({ text: `Ignored by ${interaction.user.tag}` });
              await msg.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
            }
          }
          await interaction.reply({ content: 'Ignored.', ephemeral: true }).catch(() => {});
          return;
        }
      }
    } catch (err) {
      console.error('automod interaction error', err);
    }
  });

  console.log('[Automod] Initialized.');
}

// Export API
module.exports = {
  initAutomod,
  checkMessage,
  db,
  // convenience exports so other code can call these helpers if needed
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
  saveWarn,
  listWarnsDB
};