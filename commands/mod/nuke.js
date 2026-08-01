const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
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

async function getBotOwnerId(client) {
  try {
    const app = client.application?.partial ? await client.application.fetch() : client.application;
    const owner = app?.owner;

    if (!owner) return null;

    // User owner
    if (owner.id) return owner.id;

    // Team owner fallback (if present in your setup)
    if (owner.ownerUserId) return owner.ownerUserId;

    return null;
  } catch (err) {
    console.error('[Nuke] Failed to fetch application owner:', err);
    return null;
  }
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

module.exports = {
  name: 'nuke',
  description: 'Completely wipes one or more channels by deleting and recreating them.',
  category: 'mod',
  usage: '$nuke #channel [more channels...]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Nuke Failed', 'This command can only be used in a server.')]
      });
    }

    const ownerId = await getBotOwnerId(client);
    if (!ownerId || message.author.id !== ownerId) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Nuke Failed', 'You are not authorized to use this command.')]
      });
    }

    if (!message.guild.members.me?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Nuke Failed', 'I need **Manage Channels** permission.')]
      });
    }

    const targetChannels = resolveChannels(message);

    if (!targetChannels.length) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Nuke Usage',
            `Use \`${message.prefix || '$'}nuke #channel [more channels...]\`\n\nExample:\n\`${message.prefix || '$'}nuke #general #spam #logs\``
          ),
        ],
      });
    }

    const invalid = targetChannels.filter(ch => !isTextNukeableChannel(ch));
    const valid = targetChannels.filter(ch => isTextNukeableChannel(ch));

    if (!valid.length) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Nuke Failed', 'None of the provided channels can be nuked.')]
      });
    }

    const channelList = valid.map(ch => `• ${ch}`).join('\n');
    const invalidList = invalid.length ? `\n\nSkipped:\n${invalid.map(ch => `• ${ch}`).join('\n')}` : '';

    const confirmEmbed = makeEmbed(
      '#f59e0b',
      'Nuke Confirmation',
      `You are about to nuke these channels:\n\n${channelList}${invalidList}\n\nType \`confirm\` to continue or \`cancel\` to stop.`
    );

    const prompt = await message.reply({ embeds: [confirmEmbed] });

    try {
      const collected = await message.channel.awaitMessages({
        filter: (m) =>
          m.author.id === message.author.id &&
          ['confirm', 'cancel'].includes(m.content.toLowerCase().trim()),
        max: 1,
        time: 30000,
      });

      const response = collected.first();

      if (!response || response.content.toLowerCase().trim() === 'cancel') {
        return prompt.edit({
          embeds: [makeEmbed('#6b7280', 'Nuke Cancelled', 'The nuke has been cancelled.')]
        }).catch(() => {});
      }

      await prompt.delete().catch(() => {});
      await response.delete().catch(() => {});

      const results = [];
      for (const channel of valid) {
        const data = buildChannelData(channel);
        const result = await executeNuke(message, channel, data);
        results.push({
          name: channel.name,
          ok: result.ok,
        });
      }

      const successCount = results.filter(r => r.ok).length;
      const failCount = results.length - successCount;

      return message.channel.send({
        embeds: [
          makeEmbed(
            failCount ? '#f59e0b' : '#10b981',
            'Nuke Complete',
            `Nuked **${successCount}** channel${successCount === 1 ? '' : 's'} successfully.${failCount ? ` **${failCount}** failed.` : ''}`
          )
        ]
      }).catch(() => {});
    } catch {
      return prompt.edit({
        embeds: [makeEmbed('#6b7280', 'Nuke Cancelled', 'The nuke timed out.')]
      }).catch(() => {});
    }
  },
};