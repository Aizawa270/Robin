const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'automod.sqlite');
const db = new Database(dbPath);

// ===== DATABASE TABLES =====
db.prepare(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  automod_channel TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS blacklist_words (
  guild_id TEXT,
  word TEXT,
  type TEXT,
  PRIMARY KEY (guild_id, word)
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS automod_alerts (
  guild_id TEXT,
  type TEXT,
  target_id TEXT,
  PRIMARY KEY (guild_id, type, target_id)
)
`).run();

// ===== HELPERS =====
function getGuildConfig(guildId) {
  let row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO guild_config (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  }
  return row;
}

function getBlacklist(guildId) {
  return db.prepare('SELECT * FROM blacklist_words WHERE guild_id = ?').all(guildId);
}

function getAutomodAlertList(guildId) {
  return db.prepare('SELECT * FROM automod_alerts WHERE guild_id = ?').all(guildId);
}

function isStaff(userId) {
  const allowedIds = ['852839588689870879', '1431646610752012420', '1431649052696645683']; // Astrix, Founder, Cofounder
  return allowedIds.includes(userId);
}

// ===== MAIN CHECK FUNCTION =====
async function checkMessage(client, message) {
  if (!message.guild || message.author.bot) return;

  const guildId = message.guild.id;
  const contentLower = message.content.toLowerCase();

  // 1️⃣ Check soft blacklist (delete silently)
  const softWords = db.prepare('SELECT word FROM blacklist_words WHERE guild_id = ? AND type = ?').all(guildId, 'soft');
  for (const w of softWords) {
    if (contentLower.includes(w.word.toLowerCase())) {
      try { await message.delete().catch(() => {}); } catch {}
      return; // stop further processing
    }
  }

  // 2️⃣ Check trigger blacklist (automod)
  const triggerWords = db.prepare('SELECT word FROM blacklist_words WHERE guild_id = ? AND type = ?').all(guildId, 'trigger');
  let triggeredWord = null;
  for (const w of triggerWords) {
    if (contentLower.includes(w.word.toLowerCase())) {
      triggeredWord = w.word;
      break;
    }
  }
  if (!triggeredWord) return; // nothing triggered

  // 3️⃣ Delete the offending message
  try { await message.delete().catch(() => {}); } catch {}

  // 4️⃣ Send AutomodAlert embed
  const config = getGuildConfig(guildId);
  const channelId = config.automod_channel;
  if (!channelId) return;

  const channel = message.guild.channels.cache.get(channelId);
  if (!channel) return;

  const alerts = getAutomodAlertList(guildId);
  if (!alerts.length) return;

  // Ghost ping setup
  const ghostPingUsers = alerts.filter(a => a.type === 'user').map(a => `<@${a.target_id}>`).join(' ');
  const ghostPingRoles = alerts.filter(a => a.type === 'role').map(a => `<@&${a.target_id}>`).join(' ');

  const embed = new EmbedBuilder()
    .setTitle('🚨 Automod Triggered!')
    .setColor('#FF4D4D')
    .setDescription(`**User:** <@${message.author.id}>\n**Message:** ${message.content}\n**Trigger Word:** ${triggeredWord}`)
    .setFooter({ text: 'Click buttons below to take action' })
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('automod_warn')
        .setLabel('Warn')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('automod_ban')
        .setLabel('Ban')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('automod_ignore')
        .setLabel('Ignore')
        .setStyle(ButtonStyle.Secondary),
    );

  const sentMsg = await channel.send({ content: `${ghostPingUsers} ${ghostPingRoles}`, embeds: [embed], components: [row] });

  // Remove visible ping (ghost ping)
  if (sentMsg.deletable) {
    setTimeout(() => sentMsg.edit({ content: '\u200B' }).catch(() => {}), 500);
  }

  // 5️⃣ Interaction collector for buttons
  const collector = sentMsg.createMessageComponentCollector({ time: 5 * 60 * 1000 }); // 5 min
  let warned = false;
  let banned = false;

  collector.on('collect', async (interaction) => {
    if (!isStaff(interaction.user.id)) {
      return interaction.reply({ content: "you aint important enough brochacho😹", ephemeral: true });
    }

    if (interaction.customId === 'automod_warn' && !warned) {
      warned = true;
      await interaction.reply({ content: 'Type your warning reason:', ephemeral: true });
      const filter = m => m.author.id === interaction.user.id;
      const reasonMsg = await interaction.channel.awaitMessages({ filter, max: 1, time: 60_000, errors: ['time'] }).catch(() => null);
      const reason = reasonMsg?.first()?.content || 'No reason provided';
      await interaction.followUp({ content: `Warned user <@${message.author.id}> for: ${reason}`, ephemeral: true });
      embed.addFields({ name: 'Action', value: `Warned by <@${interaction.user.id}> for: ${reason}` });
      await sentMsg.edit({ embeds: [embed], components: [] });
    }

    if (interaction.customId === 'automod_ban' && !banned) {
      banned = true;
      try {
        await message.guild.members.ban(message.author.id, { reason: `Automod trigger: ${triggeredWord}` });
        embed.addFields({ name: 'Action', value: `Banned by <@${interaction.user.id}>` });
        await sentMsg.edit({ embeds: [embed], components: [] });
        await interaction.reply({ content: `User banned successfully.`, ephemeral: true });
      } catch (err) {
        await interaction.reply({ content: `Failed to ban user.`, ephemeral: true });
      }
    }

    if (interaction.customId === 'automod_ignore') {
      embed.addFields({ name: 'Action', value: `Ignored by <@${interaction.user.id}>` });
      await sentMsg.edit({ embeds: [embed], components: [] });
      await interaction.reply({ content: 'Ignored.', ephemeral: true });
    }
  });
}

// ===== EXPORTS =====
module.exports = { checkMessage, db };