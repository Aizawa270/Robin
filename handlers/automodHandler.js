// handlers/automodHandler.js
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
  PermissionsBitField
} = require('discord.js');

const pendingActions = new Map();
const LIGHT_PINK = '#FF69B4';

// optional modstats helper
let modstatsHelper = null;
try { modstatsHelper = require('./modstatsHelper'); } catch (e) { /* optional */ }
const logModAction = (modstatsHelper && typeof modstatsHelper.logModAction === 'function') ? modstatsHelper.logModAction : () => {};

// ---------------- DB helpers ----------------
function setAutomodChannel(client, guildId, channelId) {
  if (!client?.automodDB) return false;
  client.automodDB.prepare(`INSERT OR REPLACE INTO automod_channel (guild_id, channel_id) VALUES (?, ?)`).run(guildId, channelId);
  return true;
}
function getAutomodChannel(client, guildId) {
  if (!client?.automodDB) return null;
  const r = client.automodDB.prepare(`SELECT channel_id FROM automod_channel WHERE guild_id = ?`).get(guildId);
  return r?.channel_id || null;
}
function addAlertTarget(client, guildId, type, id) {
  if (!client?.automodDB) return false;
  client.automodDB.prepare(`INSERT OR IGNORE INTO automod_alert_list (guild_id, target_type, target_id) VALUES (?, ?, ?)`).run(guildId, type, id);
  return true;
}
function removeAlertTarget(client, guildId, type, id) {
  if (!client?.automodDB) return false;
  client.automodDB.prepare(`DELETE FROM automod_alert_list WHERE guild_id = ? AND target_type = ? AND target_id = ?`).run(guildId, type, id);
  return true;
}
function listAlertTargets(client, guildId) {
  if (!client?.automodDB) return [];
  return client.automodDB.prepare(`SELECT target_type, target_id FROM automod_alert_list WHERE guild_id = ?`).all(guildId);
}

// blacklist DB & cache helpers
function addHardWord(client, guildId, word) {
  if (!client?.automodDB) return false;
  const lw = String(word).toLowerCase().trim();
  client.automodDB.prepare(`INSERT OR IGNORE INTO blacklist_hard (guild_id, word) VALUES (?, ?)`).run(guildId, lw);
  if (!client.blacklistCache) client.blacklistCache = new Map();
  if (!client.blacklistCache.has(guildId)) client.blacklistCache.set(guildId, { hard: [], soft: [] });
  const cache = client.blacklistCache.get(guildId);
  if (!cache.hard.includes(lw)) cache.hard.push(lw);
  return true;
}
function removeHardWord(client, guildId, word) {
  if (!client?.automodDB) return false;
  const lw = String(word).toLowerCase().trim();
  client.automodDB.prepare(`DELETE FROM blacklist_hard WHERE guild_id = ? AND word = ?`).run(guildId, lw);
  if (client.blacklistCache?.has(guildId)) {
    const cache = client.blacklistCache.get(guildId);
    cache.hard = cache.hard.filter(w => w !== lw);
  }
  return true;
}
function listHardWords(client, guildId) {
  if (client.blacklistCache?.has(guildId)) return client.blacklistCache.get(guildId).hard;
  if (!client?.automodDB) return [];
  return client.automodDB.prepare(`SELECT word FROM blacklist_hard WHERE guild_id = ?`).all(guildId).map(r => r.word);
}

function addSoftWord(client, guildId, word) {
  if (!client?.automodDB) return false;
  const lw = String(word).toLowerCase().trim();
  client.automodDB.prepare(`INSERT OR IGNORE INTO blacklist_soft (guild_id, word) VALUES (?, ?)`).run(guildId, lw);
  if (!client.blacklistCache) client.blacklistCache = new Map();
  if (!client.blacklistCache.has(guildId)) client.blacklistCache.set(guildId, { hard: [], soft: [] });
  const cache = client.blacklistCache.get(guildId);
  if (!cache.soft.includes(lw)) cache.soft.push(lw);
  return true;
}
function removeSoftWord(client, guildId, word) {
  if (!client?.automodDB) return false;
  const lw = String(word).toLowerCase().trim();
  client.automodDB.prepare(`DELETE FROM blacklist_soft WHERE guild_id = ? AND word = ?`).run(guildId, lw);
  if (client.blacklistCache?.has(guildId)) {
    const cache = client.blacklistCache.get(guildId);
    cache.soft = cache.soft.filter(w => w !== lw);
  }
  return true;
}
function listSoftWords(client, guildId) {
  if (client.blacklistCache?.has(guildId)) return client.blacklistCache.get(guildId).soft;
  if (!client?.automodDB) return [];
  return client.automodDB.prepare(`SELECT word FROM blacklist_soft WHERE guild_id = ?`).all(guildId).map(r => r.word);
}

// warns helpers (persist)
function listWarns(client, guildId, userId) {
  if (!client?.automodDB) return [];
  return client.automodDB.prepare(`SELECT moderator_id, reason, timestamp FROM automod_warns WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC`).all(guildId, userId);
}
function getWarnCount(client, guildId, userId) {
  if (!client?.automodDB) return 0;
  return client.automodDB.prepare(`SELECT count FROM automod_warn_counts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId)?.count || 0;
}

// build alert embed
function buildAlertEmbed(guild, targetUser, matchedWord, channelId) {
  return new EmbedBuilder()
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
}

function isStaff(member) {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageMessages) ||
         member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
         member.permissions.has(PermissionFlagsBits.Administrator);
}

// send automod alert (ghost ping + embed)
async function sendAutomodAlert(client, guild, targetUser, matchedWord, channelId = null) {
  try {
    const alertChannelId = getAutomodChannel(client, guild.id);
    if (!alertChannelId) return null;
    const channel = await client.channels.fetch(alertChannelId).catch(() => null);
    if (!channel) return null;

    const entries = listAlertTargets(client, guild.id);
    const mentionUsers = entries.filter(e => e.target_type === 'user').map(e => `<@${e.target_id}>`);
    const mentionRoles = entries.filter(e => e.target_type === 'role').map(e => `<@&${e.target_id}>`);
    const allMentions = [...mentionRoles, ...mentionUsers].join(' ').trim();

    // ghost ping: send small mention message then delete quickly
    if (allMentions) {
      try {
        const pingMsg = await channel.send({ content: allMentions, allowedMentions: { parse: ['users', 'roles'] } });
        setTimeout(() => pingMsg.delete().catch(() => {}), 800);
      } catch (e) {
        // ignore ping failures
      }
    }

    const embed = buildAlertEmbed(guild, targetUser, matchedWord, channelId);
    const sent = await channel.send({ embeds: [embed] });

    pendingActions.set(sent.id, { guildId: guild.id, targetUserId: targetUser.id, matchedWord, handled: false });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`am_warn:${sent.id}`).setLabel('Warn').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`am_ban:${sent.id}`).setLabel('Ban').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`am_ignore:${sent.id}`).setLabel('Ignore').setStyle(ButtonStyle.Secondary)
    );
    await sent.edit({ components: [row] });

    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30 * 60 * 1000 });

    collector.on('collect', async (interaction) => {
      if (!isStaff(interaction.member)) {
        try { await interaction.reply({ content: "You ain't important enough 😹", ephemeral: true }); } catch {}
        return;
      }

      const state = pendingActions.get(sent.id);
      if (!state || state.handled) {
        try { await interaction.reply({ content: "This alert has already been handled.", ephemeral: true }); } catch {}
        return;
      }

      if (interaction.customId === `am_ignore:${sent.id}`) {
        state.handled = true; pendingActions.set(sent.id, state);
        const newEmbed = EmbedBuilder.from(embed).setColor('#94a3b8').setFooter({ text: `Ignored by ${interaction.user.tag}` });
        await sent.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
        try { await interaction.reply({ content: 'Ignored.', ephemeral: true }); } catch {}
        collector.stop('handled');
        return;
      }

      if (interaction.customId === `am_warn:${sent.id}`) {
        state.handled = true; pendingActions.set(sent.id, state);
        const modal = new ModalBuilder().setCustomId(`am_warn_modal:${sent.id}:${state.targetUserId}`).setTitle('Warn Reason');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('warn_reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
        ));
        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId === `am_ban:${sent.id}`) {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`am_ban_confirm:${sent.id}`).setLabel('Confirm Ban').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`am_ban_cancel:${sent.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        try { await interaction.reply({ content: `Confirm ban of <@${state.targetUserId}>?`, components: [confirmRow], ephemeral: true }); } catch {}
        return;
      }
    });

    collector.on('end', () => {
      pendingActions.delete(sent.id);
      try { sent.edit({ components: [] }).catch(() => {}); } catch {}
    });

    return sent;
  } catch (err) {
    console.error('[Automod] sendAutomodAlert error:', err);
    return null;
  }
}

// ------------------ MAIN CHECK ------------------
async function checkMessage(client, message) {
  try {
    if (!message.guild || !message.member || message.author.bot) return;
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const guildId = message.guild.id;
    const content = (message.content || '').toLowerCase();
    const words = content.split(/\s+/);

    // SOFT WORDS: token match -> delete only
    const softWords = listSoftWords(client, guildId);
    for (const bw of softWords) {
      if (!bw) continue;
      for (const w of words) {
        const clean = w.replace(/[^\w\s]/g, '');
        if (clean === bw) {
          await message.delete().catch(() => {});
          console.log(`[Automod] Soft "${bw}" deleted from ${message.author.tag}`);
          return;
        }
      }
    }

    // HARD WORDS: token match -> delete + 15m timeout + alert + log
    const hardWords = listHardWords(client, guildId);
    for (const bw of hardWords) {
      if (!bw) continue;
      for (const w of words) {
        const clean = w.replace(/[^\w\s]/g, '');
        if (clean === bw) {
          await message.delete().catch(() => {});
          try {
            if (message.member?.moderatable) {
              await message.member.timeout(15 * 60 * 1000, `Automod triggered: ${bw}`);
              try { logModAction(client, guildId, 'AUTOMOD-SYSTEM', message.author.id, 'mute', `Automod: triggered "${bw}"`, '15m'); } catch {}
            }
          } catch (tErr) {
            console.error('[Automod] Timeout failed:', tErr);
          }
          // send alert to staff channel (ghost ping)
          await sendAutomodAlert(client, message.guild, message.author, bw, message.channel.id);
          return;
        }
      }
    }

    // INVITE LINKS
    const inviteRegex = /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\/[A-Za-z0-9]+/i;
    if (inviteRegex.test(message.content)) {
      await message.delete().catch(() => {});
      try { logModAction(client, guildId, 'AUTOMOD-SYSTEM', message.author.id, 'delete', 'discord invite link'); } catch {}
      await sendAutomodAlert(client, message.guild, message.author, 'Discord Invite Link', message.channel.id);
      return;
    }

  } catch (err) {
    console.error('[Automod] checkMessage error:', err);
  }
}

// ------------------ INTERACTION HANDLERS ------------------
async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith('am_warn_modal:')) return;

  try {
    const parts = interaction.customId.split(':');
    if (parts.length < 3) return;
    const messageId = parts[1];
    const targetUserId = parts[2];
    const guildId = interaction.guildId;
    const reason = interaction.fields.getTextInputValue('warn_reason').slice(0, 1000);

    // Save warn + increment count (atomic via ON CONFLICT)
    try {
      interaction.client.automodDB.prepare(`
        INSERT INTO automod_warns (guild_id, user_id, moderator_id, reason, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(guildId, targetUserId, interaction.user.id, reason || 'No reason provided', Date.now());

      interaction.client.automodDB.prepare(`
        INSERT INTO automod_warn_counts (guild_id, user_id, count)
        VALUES (?, ?, 1)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET count = count + 1
      `).run(guildId, targetUserId);
    } catch (dbErr) {
      console.error('[Automod] failed to save warn:', dbErr);
    }

    // log modstats
    try { logModAction(interaction.client, guildId, interaction.user.id, targetUserId, 'warn', `AUTOMOD: ${reason}`); } catch {}

    // update alert message embed in alert channel if possible
    try {
      const alertChannelId = getAutomodChannel(interaction.client, guildId);
      const channel = alertChannelId ? await interaction.client.channels.fetch(alertChannelId).catch(() => null) : null;
      if (channel) {
        const orig = await channel.messages.fetch(messageId).catch(() => null);
        if (orig?.embeds?.[0]) {
          const newEmbed = EmbedBuilder.from(orig.embeds[0]).setColor(LIGHT_PINK).setFooter({ text: `Warned by ${interaction.user.tag}` })
            .addFields({ name: 'Reason', value: reason || 'No reason provided' });
          await orig.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
        }
      }
    } catch (e) { /* ignore */ }

    await interaction.reply({ content: `User warned and saved.`, ephemeral: true });

    // DM target
    try {
      const user = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (user) {
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('⚠️ You were warned')
              .setDescription(`You received a warning in **${interaction.guild.name}**`)
              .addFields({ name: 'Reason', value: reason || 'No reason provided' }, { name: 'Moderator', value: interaction.user.tag })
              .setColor(LIGHT_PINK)
              .setTimestamp()
          ]
        }).catch(() => {});
      }
    } catch (dmErr) {}

  } catch (err) {
    console.error('[Automod] modal handler error:', err);
    try { await interaction.reply({ content: 'Failed to process warn.', ephemeral: true }); } catch {}
  }
}

async function handleBanConfirmation(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('am_ban_confirm:') && !interaction.customId.startsWith('am_ban_cancel:')) return;

  try {
    if (interaction.customId.startsWith('am_ban_cancel:')) {
      await interaction.update({ content: 'Ban cancelled.', components: [], ephemeral: true }).catch(() => {});
      return;
    }

    const parts = interaction.customId.split(':');
    if (parts.length < 2) return;
    const messageId = parts[1];
    const state = pendingActions.get(messageId);
    if (!state) {
      await interaction.update({ content: 'Ban request expired.', ephemeral: true }).catch(() => {});
      return;
    }

    try {
      const guild = await interaction.client.guilds.fetch(state.guildId);
      const member = await guild.members.fetch(state.targetUserId).catch(() => null);
      if (!member) {
        await interaction.update({ content: 'User not in server.', ephemeral: true }).catch(() => {});
        return;
      }

      await member.ban({ reason: `Automod ban: ${state.matchedWord}` });
      try { logModAction(interaction.client, state.guildId, interaction.user.id, state.targetUserId, 'ban', `AUTOMOD BAN: ${state.matchedWord}`); } catch {}

      // edit alert embed in alert channel if exists
      const alertChannelId = getAutomodChannel(interaction.client, state.guildId);
      if (alertChannelId) {
        const ch = await interaction.client.channels.fetch(alertChannelId).catch(() => null);
        if (ch) {
          const orig = await ch.messages.fetch(messageId).catch(() => null);
          if (orig?.embeds?.[0]) {
            const newEmbed = EmbedBuilder.from(orig.embeds[0]).setColor(LIGHT_PINK).setFooter({ text: `Banned by ${interaction.user.tag}` });
            await orig.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
          }
        }
      }

      pendingActions.delete(messageId);
      await interaction.update({ content: `User banned.`, components: [], ephemeral: true }).catch(() => {});
    } catch (banErr) {
      console.error('[Automod] Ban confirmation error:', banErr);
      await interaction.update({ content: `Failed to ban user: ${banErr.message}`, components: [], ephemeral: true }).catch(() => {});
    }
  } catch (err) {
    console.error('[Automod] handleBanConfirmation error:', err);
  }
}

// ------------------ INIT ------------------
function initAutomod(client) {
  if (!client) {
    console.error('[Automod] client required');
    return false;
  }
  if (!client.automodDB) {
    console.error('[Automod] Missing client.automodDB. Init aborted.');
    return false;
  }

  if (!client.blacklistCache) client.blacklistCache = new Map();

  // hydrate cache
  try {
    const guildRows = client.automodDB.prepare(`
      SELECT DISTINCT guild_id FROM (SELECT guild_id FROM blacklist_hard UNION SELECT guild_id FROM blacklist_soft)
    `).all();
    for (const { guild_id } of guildRows) {
      const hard = client.automodDB.prepare(`SELECT word FROM blacklist_hard WHERE guild_id = ?`).all(guild_id).map(r => r.word);
      const soft = client.automodDB.prepare(`SELECT word FROM blacklist_soft WHERE guild_id = ?`).all(guild_id).map(r => r.word);
      client.blacklistCache.set(guild_id, { hard, soft });
    }
  } catch (err) {
    console.error('[Automod] cache hydration failed:', err);
  }

  // attach API to client
  client.automod = {
    setAutomodChannel: (g, c) => setAutomodChannel(client, g, c),
    getAutomodChannel: (g) => getAutomodChannel(client, g),
    addAlertTarget: (g, t, id) => addAlertTarget(client, g, t, id),
    removeAlertTarget: (g, t, id) => removeAlertTarget(client, g, t, id),
    listAlertTargets: (g) => listAlertTargets(client, g),

    addHardWord: (g, w) => addHardWord(client, g, w),
    removeHardWord: (g, w) => removeHardWord(client, g, w),
    listHardWords: (g) => listHardWords(client, g),

    addSoftWord: (g, w) => addSoftWord(client, g, w),
    removeSoftWord: (g, w) => removeSoftWord(client, g, w),
    listSoftWords: (g) => listSoftWords(client, g),

    listWarns: (g, u) => listWarns(client, g, u),
    getWarnCount: (g, u) => getWarnCount(client, g, u),

    checkMessage: (message) => checkMessage(client, message)
  };

  // interaction wiring
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isModalSubmit() && interaction.customId?.startsWith('am_warn_modal:')) {
        await handleModal(interaction);
        return;
      }
      if (interaction.isButton()) {
        if (interaction.customId?.startsWith('am_ban_confirm:') || interaction.customId?.startsWith('am_ban_cancel:')) {
          await handleBanConfirmation(interaction);
          return;
        }
      }
    } catch (err) {
      console.error('[Automod] interaction error:', err);
    }
  });

  console.log('[Automod] initialized and bound to client.automod');
  return true;
}

module.exports = { initAutomod };