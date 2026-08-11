const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Optional config (bot owner IDs)
let config = null;
try { config = require('../../config'); } catch {}

// ─── Bot owner detection (same as delit.js) ────────────────
function getBotOwnerIds(client) {
  const ids = new Set();
  if (config?.ownerId) ids.add(String(config.ownerId));
  if (client?.ownerId) ids.add(String(client.ownerId));
  if (Array.isArray(client?.ownerIds)) {
    for (const id of client.ownerIds) ids.add(String(id));
  }
  if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));
  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

// ─── Lazy flood DB + access table ──────────────────────────
function ensureFloodInfra(client) {
  if (client._floodReady) return;

  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, 'flood.sqlite'));
  db.pragma('journal_mode = WAL');
  db.prepare(`
    CREATE TABLE IF NOT EXISTS flood_access (
      guild_id TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'user',
      target_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, target_type, target_id)
    )
  `).run();
  client.floodDB = db;
  client._floodReady = true;
}

// ─── User resolver: mention, ID, global username only ──────
async function resolveUser(client, message, raw) {
  if (!raw) return null;

  // Universal resolver if available
  if (typeof message.resolveUser === 'function') {
    try { return await message.resolveUser(raw); } catch {}
  }

  const query = String(raw).trim();
  if (!query) return null;

  // Mention
  const mentionMatch = query.match(/^<@!?(\d{17,20})>$/);
  if (mentionMatch) {
    try { return await client.users.fetch(mentionMatch[1]); } catch {}
  }

  // Raw ID
  if (/^\d{17,20}$/.test(query)) {
    try { return await client.users.fetch(query); } catch {}
  }

  // Global username (exact match only)
  if (message.guild) {
    await message.guild.members.fetch().catch(() => {});
    const lowered = query.toLowerCase();
    const member = message.guild.members.cache.find(m =>
      m.user.globalName?.toLowerCase() === lowered ||
      m.user.username.toLowerCase() === lowered
    );
    if (member) return member.user;
  }

  return null;
}

module.exports = {
  name: 'flood',
  description: 'Fast webhook flood with Vanessa webhooks. Subcommand: access add/remove/list to manage per‑server access.',
  category: 'utility',
  hidden: true,
  usage: '$flood [channel/user] <amount> <text> | $flood access <add|remove|list> [@user|id|global username]',
  async execute(client, message, args) {
    if (!message.guild) return;
    ensureFloodInfra(client);
    const prefix = client.getPrefix?.(message.guild.id) || '$';

    // ─── Access subcommand (guild only, bot owner only) ────
    if (args[0]?.toLowerCase() === 'access') {
      if (!isBotOwner(client, message.author.id)) {
        return message.reply({
          embeds: [new EmbedBuilder().setColor('#ff0000').setDescription('Only the bot owner can manage flood access.')]
        });
      }

      const action = args[1]?.toLowerCase();
      if (!action || !['add', 'remove', 'list'].includes(action)) {
        const embed = new EmbedBuilder()
          .setColor('#f59e0b')
          .setTitle('Flood Access Usage')
          .setDescription(
            `\`${prefix}flood access add @user|id|global username\`\n` +
            `\`${prefix}flood access remove @user|id|global username\`\n` +
            `\`${prefix}flood access list\``
          );
        return message.reply({ embeds: [embed] });
      }

      if (action === 'list') {
        const rows = client.floodDB.prepare(
          'SELECT target_id FROM flood_access WHERE guild_id = ? AND target_type = ?'
        ).all(message.guild.id, 'user');

        if (!rows.length) {
          return message.reply({
            embeds: [new EmbedBuilder().setColor('#3b82f6').setDescription('No users have flood access in this server.')]
          });
        }

        const users = await Promise.all(rows.map(async r => {
          try { const u = await client.users.fetch(r.target_id); return `<@${u.id}>`; } catch { return null; }
        }));
        const list = users.filter(Boolean).join('\n') || 'No valid users found.';
        return message.reply({
          embeds: [new EmbedBuilder().setColor('#3b82f6').setTitle('Flood Access List').setDescription(list)]
        });
      }

      const targetArg = args[2];
      if (!targetArg) {
        return message.reply('Please provide a user mention, ID, or global username.');
      }

      const target = await resolveUser(client, message, targetArg);
      if (!target) {
        return message.reply('Could not find that user. Use a mention, user ID, or global username.');
      }

      if (target.bot) {
        return message.reply('Bots do not need flood access.');
      }

      if (action === 'add') {
        client.floodDB.prepare(
          'INSERT OR IGNORE INTO flood_access (guild_id, target_type, target_id) VALUES (?, ?, ?)'
        ).run(message.guild.id, 'user', target.id);
        return message.reply({
          embeds: [new EmbedBuilder().setColor('#00ff00').setDescription(`**${target.tag}** can now use flood commands in this server.`)]
        });
      }

      // remove
      client.floodDB.prepare(
        'DELETE FROM flood_access WHERE guild_id = ? AND target_type = ? AND target_id = ?'
      ).run(message.guild.id, 'user', target.id);
      return message.reply({
        embeds: [new EmbedBuilder().setColor('#ef4444').setDescription(`**${target.tag}** can no longer use flood commands in this server.`)]
      });
    }

    // ─── Normal flood permission check ──────────────────────
    const isOwner = isBotOwner(client, message.author.id);
    let hasAccess = false;
    if (!isOwner) {
      const row = client.floodDB.prepare(
        'SELECT 1 FROM flood_access WHERE guild_id = ? AND target_type = ? AND target_id = ?'
      ).get(message.guild.id, 'user', message.author.id);
      hasAccess = !!row;
    }

    if (!isOwner && !hasAccess) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor('#f472b6').setDescription("You're not that guy")]
      });
    }

    // ── Target parsing (UPDATED) ────────────────────────────
    let targetChannel = message.channel;
    let targetUser = null;
    let targetDM = false;
    let amountIndex = 0;

    if (args[0]) {
      // Try to resolve as user first (mention, ID, global username)
      const user = await resolveUser(client, message, args[0]);
      if (user) {
        targetUser = user;
        targetDM = true;
        amountIndex = 1;
      } else {
        // Not a user – try channel mention
        const channelMatch = args[0].match(/^<#(\d+)>$/);
        if (channelMatch) {
          const channelId = channelMatch[1];
          try {
            const channel = await message.guild.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
              targetChannel = channel;
              amountIndex = 1;
            } else {
              return message.reply('Invalid channel or channel is not text-based.');
            }
          } catch {
            return message.reply('Could not find that channel.');
          }
        }
        // If neither user nor channel, args[0] is likely the amount (will be handled below)
      }
    }

    const amount = parseInt(args[amountIndex]);
    if (isNaN(amount) || amount < 1 || amount > 5000)
      return message.reply('Amount must be 1-5000.');

    const textArgs = args.slice(amountIndex + 1);
    const text = textArgs.join(' ');
    if (!text) return message.reply('Need text to send.');

    let targetDescription = targetDM
      ? `**Target:** ${targetUser.tag} (DM)`
      : `**Target:** ${targetChannel}`;

    // ── Rest of the flood execution (unchanged) ─────────────
    const startEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('NUCLEAR FLOOD ACTIVATED')
      .setDescription(`${targetDescription}\n**Amount:** ${amount}\n**Text:** "${text}"`)
      .addFields(
        { name: 'Webhooks', value: '5x Vanessa', inline: true },
        { name: 'Method', value: 'Parallel Send', inline: true },
        { name: 'Status', value: 'Starting...', inline: true }
      )
      .setFooter({ text: 'Vanessa Flood System v3' })
      .setTimestamp();

    const startMsg = await message.reply({ embeds: [startEmbed] });
    const startTime = Date.now();

    try {
      if (targetDM) {
        let sent = 0, failed = 0;
        const updateProgress = async () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;
          const embed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('DM FLOOD IN PROGRESS')
            .setDescription(`**Target:** ${targetUser.tag}`)
            .addFields(
              { name: 'Sent', value: `${sent}/${amount}`, inline: true },
              { name: 'Failed', value: `${failed}`, inline: true },
              { name: 'Time', value: `${elapsed.toFixed(1)}s`, inline: true },
              { name: 'Speed', value: `${speed}/sec`, inline: true },
              { name: 'Progress', value: `${Math.round((sent/amount)*100)}%`, inline: true }
            )
            .setFooter({ text: 'Vanessa Flood System • Working...' })
            .setTimestamp();
          try { await startMsg.edit({ embeds: [embed] }); } catch {}
        };

        for (let i = 0; i < amount; i++) {
          try {
            await targetUser.send(text);
            sent++;
            if (sent % 25 === 0) await updateProgress();
            if (sent % 5 === 0) await new Promise(r => setTimeout(r, 100));
          } catch (error) {
            failed++;
            if (error.code === 50007 || error.message.includes('Cannot send messages to this user')) break;
            if (error.code === 40001 || error.code === 40002) await new Promise(r => setTimeout(r, 1000));
          }
        }

        const totalTime = (Date.now() - startTime) / 1000;
        const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;
        const result = new EmbedBuilder()
          .setColor(sent >= amount ? '#00ff00' : '#ffaa00')
          .setTitle(sent >= amount ? 'FLOOD COMPLETE' : 'FLOOD PARTIAL')
          .setDescription(`**Target:** ${targetUser.tag}`)
          .addFields(
            { name: 'Success', value: `${sent}/${amount}`, inline: true },
            { name: 'Failed', value: `${failed}`, inline: true },
            { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
            { name: 'Avg Speed', value: `${speed}/sec`, inline: true },
            { name: 'Completion', value: `${Math.round((sent/amount)*100)}%`, inline: true }
          )
          .setFooter({ text: 'Vanessa Flood System • Job Done' })
          .setTimestamp();
        await startMsg.edit({ embeds: [result] });
      } else {
        const webhooks = [];
        let sent = 0, failed = 0;
        for (let i = 0; i < 5; i++) {
          try {
            const webhook = await targetChannel.createWebhook({
              name: 'Vanessa',
              avatar: 'https://cdn.discordapp.com/attachments/852839588689870879/1214567890123456789/vanessa.png',
              reason: 'Flood command'
            });
            webhooks.push(webhook);
          } catch {}
        }
        if (webhooks.length === 0) throw new Error('Could not create any webhooks');

        const updateProgress = async () => {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? Math.round(sent / elapsed) : 0;
          const embed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('FLOOD IN PROGRESS')
            .setDescription(`**Target:** ${targetChannel}`)
            .addFields(
              { name: 'Sent', value: `${sent}/${amount}`, inline: true },
              { name: 'Failed', value: `${failed}`, inline: true },
              { name: 'Time', value: `${elapsed.toFixed(1)}s`, inline: true },
              { name: 'Speed', value: `${speed}/sec`, inline: true },
              { name: 'Webhooks', value: `${webhooks.length} active`, inline: true },
              { name: 'Progress', value: `${Math.round((sent/amount)*100)}%`, inline: true }
            )
            .setFooter({ text: 'Vanessa Flood System • Working...' })
            .setTimestamp();
          try { await startMsg.edit({ embeds: [embed] }); } catch {}
        };

        const floodWebhook = async (webhook) => {
          let localSent = 0;
          const maxPerWebhook = Math.ceil(amount / webhooks.length);
          while (sent < amount && localSent < maxPerWebhook) {
            try {
              await webhook.send({
                content: text,
                username: 'Vanessa',
                avatarURL: client.user.displayAvatarURL()
              });
              sent++;
              localSent++;
              if (sent % 25 === 0) await updateProgress();
              if (sent % 5 === 0) await new Promise(r => setTimeout(r, 20));
            } catch (err) {
              failed++;
              if (err.code === 10015 || err.code === 429) {
                webhooks.splice(webhooks.indexOf(webhook), 1);
                break;
              }
              await new Promise(r => setTimeout(r, 100));
            }
          }
          return localSent;
        };

        await Promise.allSettled(webhooks.map(floodWebhook));

        for (const webhook of webhooks) try { await webhook.delete(); } catch {}

        const totalTime = (Date.now() - startTime) / 1000;
        const speed = totalTime > 0 ? Math.round(sent / totalTime) : 0;
        const result = new EmbedBuilder()
          .setColor(sent >= amount ? '#00ff00' : '#ffaa00')
          .setTitle(sent >= amount ? 'FLOOD COMPLETE' : 'FLOOD PARTIAL')
          .setDescription(`**Target:** ${targetChannel}`)
          .addFields(
            { name: 'Success', value: `${sent}/${amount}`, inline: true },
            { name: 'Failed', value: `${failed}`, inline: true },
            { name: 'Total Time', value: `${totalTime.toFixed(2)}s`, inline: true },
            { name: 'Avg Speed', value: `${speed}/sec`, inline: true },
            { name: 'Completion', value: `${Math.round((sent/amount)*100)}%`, inline: true },
            { name: 'Webhooks Used', value: '5x Vanessa', inline: true }
          )
          .setFooter({ text: 'Vanessa Flood System • Job Done' })
          .setTimestamp();
        await startMsg.edit({ embeds: [result] });
      }
    } catch (error) {
      const errEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('FLOOD FAILED')
        .setDescription(`**Error:** ${error.message}`)
        .setFooter({ text: 'Vanessa Flood System • Error' })
        .setTimestamp();
      await startMsg.edit({ embeds: [errEmbed] });
    }
  },
};