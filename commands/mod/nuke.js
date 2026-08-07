const {
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let config = null;
try {
  config = require('../../config');
} catch {}

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'nukeaccess.sqlite');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

function ensureDb(client) {
  if (client.nukeAccessDB) return client.nukeAccessDB;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS nuke_access (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    )
  `).run();

  client.nukeAccessDB = db;
  return db;
}

function isTextNukeableChannel(channel) {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
  ].includes(channel.type);
}

function resolveChannels(message) {
  const channels = [];

  for (const [, ch] of message.mentions.channels) {
    if (ch && !channels.some(existing => existing.id === ch.id)) {
      channels.push(ch);
    }
  }

  return channels;
}

function buildChannelData(channel) {
  return {
    name: channel.name,
    type: channel.type,
    parent: channel.parentId,
    position: channel.rawPosition,
    topic: channel.topic || null,
    nsfw: channel.nsfw || false,
    rateLimitPerUser: channel.rateLimitPerUser || 0,
    permissionOverwrites: channel.permissionOverwrites.cache.map(o => ({
      id: o.id,
      allow: o.allow.bitfield.toString(),
      deny: o.deny.bitfield.toString(),
      type: o.type,
    })),
  };
}

function getBotOwnerIds(client) {
  const ids = new Set();

  if (config?.ownerId) ids.add(String(config.ownerId));
  if (Array.isArray(config?.ownerIds)) {
    for (const id of config.ownerIds) ids.add(String(id));
  }

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

function isServerOwner(message) {
  return !!message.guild?.ownerId && String(message.author.id) === String(message.guild.ownerId);
}

function hasNukeAccess(client, guildId, userId) {
  const db = ensureDb(client);
  const row = db.prepare(
    'SELECT 1 FROM nuke_access WHERE guild_id = ? AND user_id = ?'
  ).get(String(guildId), String(userId));

  return !!row;
}

function canUseNuke(client, message) {
  return isBotOwner(client, message.author.id) || isServerOwner(message) || hasNukeAccess(client, message.guild.id, message.author.id);
}

async function resolveTargetUser(client, message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    const resolved = await message.resolveUser(input).catch(() => null);
    if (resolved) return resolved;
  }

  const raw = String(input).trim();
  if (!raw) return null;

  const mention = raw.match(/^<@!?(\d{15,20})>$/);
  if (mention) {
    const id = mention[1];
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const idOnly = raw.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(idOnly)) {
    const cached = client.users.cache.get(idOnly);
    if (cached) return cached;
    return await client.users.fetch(idOnly).catch(() => null);
  }

  const lowered = raw.toLowerCase();
  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered ||
    u?.tag?.toLowerCase() === lowered
  );

  if (cachedUser) return cachedUser;

  return null;
}

async function executeNuke(message, targetChannel, channelData) {
  try {
    await targetChannel.delete(`Nuked by ${message.author.tag}`);

    const newChannel = await message.guild.channels.create({
      name: channelData.name,
      type: channelData.type,
      parent: channelData.parent,
      position: channelData.position,
      topic: channelData.topic,
      nsfw: channelData.nsfw,
      rateLimitPerUser: channelData.rateLimitPerUser,
      permissionOverwrites: channelData.permissionOverwrites,
      reason: `Nuked by ${message.author.tag}`,
    });

    const embed = new EmbedBuilder()
      .setColor('#dc2626')
      .setDescription(`**${newChannel.name}** has been completely nuked.`)
      .setTimestamp();

    await newChannel.send({ embeds: [embed] }).catch(() => {});
    return { ok: true, newChannel };
  } catch (err) {
    console.error(`Nuke error in channel ${targetChannel?.id}:`, err);
    return { ok: false, error: err };
  }
}

async function executeNukeWithDelay(message, targetChannel, channelData, index) {
  if (index > 0) {
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  return executeNuke(message, targetChannel, channelData);
}

function usageEmbed(prefix) {
  return makeEmbed(
    '#f59e0b',
    'Nuke Usage',
    [
      `\`${prefix}nuke #channel [more channels...]\``,
      `\`${prefix}nuke access add @user|userID|username\``,
      `\`${prefix}nuke access remove @user|userID|username\``,
      `\`${prefix}nuke access list\``,
      '',
      'Example:',
      `\`${prefix}nuke #general #spam #logs\``,
    ].join('\n')
  );
}

module.exports = {
  name: 'nuke',
  description: 'Completely wipes one or more channels by deleting and recreating them.',
  category: 'mod',
  usage: '$nuke #channel [more channels...]',

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Nuke Failed', 'This command can only be used in a server.')],
      });
    }

    const db = ensureDb(client);
    const prefix = client.getPrefix?.(message.guild.id) || '$';
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'access') {
      if (!isBotOwner(client, message.author.id)) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Access Denied', 'Only the bot owner can manage nuke access.')],
        });
      }

      const action = String(args[1] || '').toLowerCase();

      if (!['add', 'remove', 'list'].includes(action)) {
        return message.reply({ embeds: [usageEmbed(prefix)] });
      }

      if (action === 'list') {
        const rows = db.prepare(
          'SELECT user_id FROM nuke_access WHERE guild_id = ? ORDER BY user_id ASC'
        ).all(message.guild.id);

        if (!rows.length) {
          return message.reply({
            embeds: [
              makeEmbed('#3b82f6', 'Nuke Access List', 'No users have nuke access in this server.'),
            ],
          });
        }

        const users = await Promise.all(rows.map(async row => {
          try {
            const user = await client.users.fetch(row.user_id);
            return user ? `<@${user.id}>` : null;
          } catch {
            return null;
          }
        }));

        const clean = users.filter(Boolean).join('\n') || 'No valid users found.';
        return message.reply({
          embeds: [makeEmbed('#3b82f6', 'Nuke Access List', clean)],
        });
      }

      const target = await resolveTargetUser(client, message, args[2]);
      if (!target) {
        return message.reply({
          embeds: [
            makeEmbed('#f59e0b', 'Nuke Access Failed', 'Provide a valid user mention, ID, or exact username.'),
          ],
        });
      }

      if (target.bot) {
        return message.reply({
          embeds: [makeEmbed('#f59e0b', 'Nuke Access Failed', 'Bots do not need nuke access.')],
        });
      }

      if (action === 'add') {
        db.prepare(
          'INSERT OR IGNORE INTO nuke_access (guild_id, user_id) VALUES (?, ?)'
        ).run(message.guild.id, target.id);

        return message.reply({
          embeds: [
            makeEmbed('#22c55e', 'Access Added', `**${target.tag}** can now use \`${prefix}nuke\` in this server.`),
          ],
        });
      }

      db.prepare(
        'DELETE FROM nuke_access WHERE guild_id = ? AND user_id = ?'
      ).run(message.guild.id, target.id);

      return message.reply({
        embeds: [
          makeEmbed('#ef4444', 'Access Removed', `**${target.tag}** can no longer use \`${prefix}nuke\` in this server.`),
        ],
      });
    }

    if (!canUseNuke(client, message)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Nuke Failed', 'You are not authorized to use this command.')],
      });
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Nuke Failed', 'I need **Manage Channels** permission.')],
      });
    }

    const targetChannels = resolveChannels(message);

    if (!targetChannels.length) {
      return message.reply({
        embeds: [usageEmbed(prefix)],
      });
    }

    const invalid = targetChannels.filter(ch => !isTextNukeableChannel(ch));
    const valid = targetChannels.filter(ch => isTextNukeableChannel(ch));

    if (!valid.length) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Nuke Failed', 'None of the provided channels can be nuked.')],
      });
    }

    const channelList = valid.map(ch => `• ${ch}`).join('\n');
    const invalidList = invalid.length ? `\n\nSkipped:\n${invalid.map(ch => `• ${ch}`).join('\n')}` : '';

    const confirmEmbed = makeEmbed(
      '#f59e0b',
      'Nuke Confirmation',
      `You are about to nuke these channels:\n\n${channelList}${invalidList}\n\nClick a button below to continue or cancel.`
    );

    const nukeButton = new ButtonBuilder()
      .setCustomId('nuke_confirm')
      .setLabel('Nuke')
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId('nuke_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(nukeButton, cancelButton);

    const prompt = await message.reply({ embeds: [confirmEmbed], components: [row] });

    const collector = prompt.createMessageComponentCollector({ time: 30000 });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: 'You are not authorized to use this.',
          ephemeral: true,
        }).catch(() => {});
      }

      if (interaction.customId === 'nuke_cancel') {
        await interaction.update({
          embeds: [makeEmbed('#6b7280', 'Nuke Cancelled', 'The nuke has been cancelled.')],
          components: [],
        }).catch(() => {});
        collector.stop();
        return;
      }

      if (interaction.customId === 'nuke_confirm') {
        await interaction.update({
          embeds: [makeEmbed('#f59e0b', 'Nuking...', 'Nuke in progress, please wait...')],
          components: [],
        }).catch(() => {});
        collector.stop();

        const channelDataMap = valid.map(ch => ({
          channel: ch,
          data: buildChannelData(ch),
        }));

        if (valid.length >= 3) {
          const results = await Promise.allSettled(
            channelDataMap.map(({ channel, data }, index) =>
              executeNukeWithDelay(message, channel, data, index)
            )
          );

          const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
          const failCount = results.length - successCount;

          return prompt.edit({
            embeds: [
              makeEmbed(
                failCount ? '#f59e0b' : '#10b981',
                'Nuke Complete',
                `Nuked **${successCount}** channel${successCount === 1 ? '' : 's'} successfully.${failCount ? ` **${failCount}** failed.` : ''}`
              ),
            ],
            components: [],
          }).catch(() => {});
        }

        const results = [];
        for (const { channel, data } of channelDataMap) {
          const result = await executeNuke(message, channel, data);
          results.push({ name: channel.name, ok: result.ok });
        }

        const successCount = results.filter(r => r.ok).length;
        const failCount = results.length - successCount;

        return prompt.edit({
          embeds: [
            makeEmbed(
              failCount ? '#f59e0b' : '#10b981',
              'Nuke Complete',
              `Nuked **${successCount}** channel${successCount === 1 ? '' : 's'} successfully.${failCount ? ` **${failCount}** failed.` : ''}`
            ),
          ],
          components: [],
        }).catch(() => {});
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'time') {
        await prompt.edit({
          embeds: [makeEmbed('#6b7280', 'Nuke Timed Out', 'The nuke confirmation timed out.')],
          components: [],
        }).catch(() => {});
      }
    });
  },
};