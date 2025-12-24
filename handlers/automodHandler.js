// handlers/automodHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, PermissionFlagsBits, PermissionsBitField } = require('discord.js');

const pendingActions = new Map();
const LIGHT_PINK = '#FF69B4';

// Optional modstats helper
let logModAction = () => {};
try {
  const mod = require('./modstatsHelper');
  if (mod?.logModAction) logModAction = mod.logModAction;
} catch {}

// ----------------- DB HELPERS -----------------
function setAutomodChannel(client, guildId, channelId) {
  client.automodDB?.prepare(`INSERT OR REPLACE INTO automod_channel (guild_id, channel_id) VALUES (?, ?)`).run(guildId, channelId);
  return true;
}
function getAutomodChannel(client, guildId) {
  const row = client.automodDB?.prepare(`SELECT channel_id FROM automod_channel WHERE guild_id = ?`).get(guildId);
  return row?.channel_id || null;
}

function addAlertTarget(client, guildId, type, id) {
  client.automodDB?.prepare(`INSERT OR IGNORE INTO automod_alert_list (guild_id, target_type, target_id) VALUES (?, ?, ?)`).run(guildId, type, id);
  return true;
}
function removeAlertTarget(client, guildId, type, id) {
  client.automodDB?.prepare(`DELETE FROM automod_alert_list WHERE guild_id = ? AND target_type = ? AND target_id = ?`).run(guildId, type, id);
  return true;
}
function listAlertTargets(client, guildId) {
  return client.automodDB?.prepare(`SELECT target_type, target_id FROM automod_alert_list WHERE guild_id = ?`).all(guildId) || [];
}

// ----------------- BLACKLIST HELPERS -----------------
function addHardWord(client, guildId, word) {
  const lw = String(word).toLowerCase().trim();
  client.automodDB?.prepare(`INSERT OR IGNORE INTO blacklist_hard (guild_id, word) VALUES (?, ?)`).run(guildId, lw);
  // cache
  if (!client.blacklistCache.has(guildId)) client.blacklistCache.set(guildId, { hard: [], soft: [] });
  const cache = client.blacklistCache.get(guildId);
  if (!cache.hard.includes(lw)) cache.hard.push(lw);
  return true;
}
function removeHardWord(client, guildId, word) {
  const lw = String(word).toLowerCase().trim();
  client.automodDB?.prepare(`DELETE FROM blacklist_hard WHERE guild_id = ? AND word = ?`).run(guildId, lw);
  if (client.blacklistCache.has(guildId)) {
    client.blacklistCache.get(guildId).hard = client.blacklistCache.get(guildId).hard.filter(w => w !== lw);
  }
  return true;
}
function listHardWords(client, guildId) {
  return client.blacklistCache.get(guildId)?.hard || [];
}

function addSoftWord(client, guildId, word) {
  const lw = String(word).toLowerCase().trim();
  client.automodDB?.prepare(`INSERT OR IGNORE INTO blacklist_soft (guild_id, word) VALUES (?, ?)`).run(guildId, lw);
  if (!client.blacklistCache.has(guildId)) client.blacklistCache.set(guildId, { hard: [], soft: [] });
  const cache = client.blacklistCache.get(guildId);
  if (!cache.soft.includes(lw)) cache.soft.push(lw);
  return true;
}
function removeSoftWord(client, guildId, word) {
  const lw = String(word).toLowerCase().trim();
  client.automodDB?.prepare(`DELETE FROM blacklist_soft WHERE guild_id = ? AND word = ?`).run(guildId, lw);
  if (client.blacklistCache.has(guildId)) {
    client.blacklistCache.get(guildId).soft = client.blacklistCache.get(guildId).soft.filter(w => w !== lw);
  }
  return true;
}
function listSoftWords(client, guildId) {
  return client.blacklistCache.get(guildId)?.soft || [];
}

// ----------------- WARNS HELPERS -----------------
function listWarns(client, guildId, userId) {
  return client.automodDB?.prepare(`SELECT moderator_id, reason, timestamp FROM automod_warns WHERE guild_id = ? AND user_id = ? ORDER BY timestamp DESC`).all(guildId, userId) || [];
}
function getWarnCount(client, guildId, userId) {
  return client.automodDB?.prepare(`SELECT count FROM automod_warn_counts WHERE guild_id = ? AND user_id = ?`).get(guildId, userId)?.count || 0;
}

// ----------------- ALERT EMBEDS -----------------
function buildAlertEmbed(guild, targetUser, matchedWord, channelId) {
  return new EmbedBuilder()
    .setTitle('「 ✦ 𝐀𝐔𝐓𝐎𝐌𝐎𝐃 𝐀𝐋𝐄𝐑𝐓 ✦ 」')
    .setColor(LIGHT_PINK)
    .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
    .setDescription(`➤  **Target:** ${targetUser.tag}\n➤  **Trigger:** \`${matchedWord}\`\n➤  **Channel:** ${channelId ? `<#${channelId}>` : 'Unknown'}\n➤  **Time:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n**Actions:** Use the buttons below to Warn / Ban / Ignore.`);
}

function isStaff(member) {
  return member?.permissions.has(PermissionFlagsBits.ManageMessages) || member?.permissions.has(PermissionFlagsBits.ModerateMembers) || member?.permissions.has(PermissionFlagsBits.Administrator);
}

// ----------------- AUTOMOD ALERT -----------------
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

    if (allMentions) {
      const pingMsg = await channel.send({ content: allMentions, allowedMentions: { parse: ['users', 'roles'] } });
      setTimeout(() => pingMsg.delete().catch(() => {}), 800);
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
      if (!isStaff(interaction.member)) return interaction.reply({ content: "You ain't important enough 😹", ephemeral: true });

      const state = pendingActions.get(sent.id);
      if (!state || state.handled) return interaction.reply({ content: "This alert has already been handled.", ephemeral: true });

      if (interaction.customId === `am_ignore:${sent.id}`) {
        state.handled = true; pendingActions.set(sent.id, state);
        const newEmbed = EmbedBuilder.from(embed).setColor('#94a3b8').setFooter({ text: `Ignored by ${interaction.user.tag}` });
        await sent.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
        await interaction.reply({ content: 'Ignored.', ephemeral: true });
        collector.stop('handled');
        return;
      }

      if (interaction.customId === `am_warn:${sent.id}`) {
        state.handled = true; pendingActions.set(sent.id, state);
        const modal = new ModalBuilder().setCustomId(`am_warn_modal:${sent.id}:${state.targetUserId}`).setTitle('Warn Reason');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('warn_reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true)
        ));
        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId === `am_ban:${sent.id}`) {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`am_ban_confirm:${sent.id}`).setLabel('Confirm Ban').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`am_ban_cancel:${sent.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: `Confirm ban of <@${state.targetUserId}>?`, components: [confirmRow], ephemeral: true });
        return;
      }
    });

    collector.on('end', () => {
      pendingActions.delete(sent.id);
      sent.edit({ components: [] }).catch(() => {});
    });

    return sent;
  } catch (err) {
    console.error('[Automod] sendAutomodAlert error:', err);
    return null;
  }
}

// ----------------- CHECK MESSAGE -----------------
async function checkMessage(client, message) {
  try {
    if (!message.guild || !message.member || message.author.bot) return;
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    const guildId = message.guild.id;
    const content = (message.content || '').toLowerCase();
    const words = content.split(/\s+/);

    // SOFT WORDS
    for (const bw of listSoftWords(client, guildId)) {
      if (!bw) continue;
      for (const w of words) if (w.replace(/[^\w\s]/g, '') === bw) {
        await message.delete().catch(() => {});
        console.log(`[Automod] Soft "${bw}" deleted from ${message.author.tag}`);
        return;
      }
    }

    // HARD WORDS
    for (const bw of listHardWords(client, guildId)) {
      if (!bw) continue;
      for (const w of words) if (w.replace(/[^\w\s]/g, '') === bw) {
        await message.delete().catch(() => {});
        try {
          if (message.member?.moderatable) {
            await message.member.timeout(15 * 60 * 1000, `Automod triggered: ${bw}`);
            logModAction(client, guildId, 'AUTOMOD-SYSTEM', message.author.id, 'mute', `Automod: triggered "${bw}"`, '15m');
          }
        } catch {}
        await sendAutomodAlert(client, message.guild, message.author, bw, message.channel.id);
        return;
      }
    }

    // INVITES
    if (/(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\/[A-Za-z0-9]+/i.test(message.content)) {
      await message.delete().catch(() => {});
      logModAction(client, guildId, 'AUTOMOD-SYSTEM', message.author.id, 'delete', 'discord invite link');
      await sendAutomodAlert(client, message.guild, message.author, 'Discord Invite Link', message.channel.id);
      return;
    }
  } catch (err) {
    console.error('[Automod] checkMessage error:', err);
  }
}

// ----------------- INTERACTIONS -----------------
async function handleModal(interaction) {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith('am_warn_modal:')) return;
  try {
    const [, messageId, targetUserId] = interaction.customId.split(':');
    const reason = interaction.fields.getTextInputValue('warn_reason').slice(0, 1000);
    const guildId = interaction.guildId;

    // Save warn
    interaction.client.automodDB.prepare(`
      INSERT INTO automod_warns (guild_id, user_id, moderator_id, reason, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, targetUserId, interaction.user.id, reason || 'No reason provided', Date.now());

    interaction.client.automodDB.prepare(`
      INSERT INTO automod_warn_counts (guild_id, user_id, count)
      VALUES (?, ?, 1)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET count = count + 1
    `).run(guildId, targetUserId);

    logModAction(interaction.client, guildId, interaction.user.id, targetUserId, 'warn', `AUTOMOD: ${reason}`);

    // Edit alert embed
    const alertChannelId = getAutomodChannel(interaction.client, guildId);
    const channel = alertChannelId ? await interaction.client.channels.fetch(alertChannelId).catch(() => null) : null;
    if (channel) {
      const orig = await channel.messages.fetch(messageId).catch(() => null);
      if (orig?.embeds[0]) {
        const newEmbed = EmbedBuilder.from(orig.embeds[0])
          .setColor(LIGHT_PINK)
          .setFooter({ text: `Warned by ${interaction.user.tag}` })
          .addFields({ name: 'Reason', value: reason || 'No reason provided' });
        await orig.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
      }
    }

    await interaction.reply({ content: `User warned and saved.`, ephemeral: true });

    // DM target
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
  } catch (err) {
    console.error('[Automod] modal handler error:', err);
    try { await interaction.reply({ content: 'Failed to process warn.', ephemeral: true }); } catch {}
  }
}

// ----------------- INIT -----------------
function initAutomod(client) {
  if (!client?.automodDB) {
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
  } catch (err) { console.error('[Automod] cache hydration failed:', err); }

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

  // wire interactions
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isModalSubmit()) await handleModal(interaction);
    } catch (err) { console.error('[Automod] interaction error:', err); }
  });

  console.log('[Automod] initialized and bound to client.automod');
  return true;
}

module.exports = { initAutomod };