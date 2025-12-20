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
      `╰┈➤ **__Requirements:__** ${requirementRoleId ? `<@&${requirementRoleId}>` : '\`\`none\`\`'}`,
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

      if (custom === `am_ignore:${sent.id}`) {
        state.handled = true;
        pendingActions.set(sent.id, state);
        const newEmbed = EmbedBuilder.from(embed).setColor('#94a3b8').setFooter({ text: `Ignored by ${interaction.user.tag}` });
        await sent.edit({ embeds: [newEmbed], components: [] });
        await interaction.reply({ content: `Ignored.`, ephemeral: true });
        collector.stop('handled');
        return;
      }

      if (custom === `am_warn:${sent.id}`) {
        state.handled = true;
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

      if (custom === `am_ban:${sent.id}`) {
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

  // Handle button interactions (keep your existing code or add basic handler)
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
    
    // Add your button/modal handling logic here if you have any
    // For now, we'll just acknowledge to prevent unhandled interaction errors
    if (interaction.isButton()) {
      await interaction.deferUpdate().catch(() => {});
    }
  });

  console.log('[Automod] System initialized - Admin bypass enabled, 15min timeouts');
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