const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

const NUKE_ROLE_ID = '1447894643277561856';
const NUKE_GIF = 'https://tenor.com/bk6mI.gif';

module.exports = {
  name: 'nuke',
  description: 'Completely wipes a channel by deleting and recreating it.',
  category: 'mod',
  usage: '$nuke <#channel | channelId>',
  async execute(client, message, args) {
    if (!message.guild) return;

    // 🔒 ROLE-ONLY ACCESS
    if (!message.member.roles.cache.has(NUKE_ROLE_ID)) {
      return message.reply('You are not authorized to use this command.');
    }

    // Bot permission check
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('I need **Manage Channels** permission.');
    }

    // 🎯 TARGET CHANNEL
    const targetChannel =
      message.mentions.channels.first() ||
      (args[0] && message.guild.channels.cache.get(args[0]));

    if (!targetChannel) {
      return message.reply('Provide a valid channel mention or channel ID.');
    }

    if (
      ![
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildForum,
      ].includes(targetChannel.type)
    ) {
      return message.reply('This channel type cannot be nuked.');
    }

    // 🧠 SAVE CHANNEL DATA
    const channelData = {
      name: targetChannel.name,
      type: targetChannel.type,
      parent: targetChannel.parentId,
      position: targetChannel.rawPosition,
      topic: targetChannel.topic || null,
      nsfw: targetChannel.nsfw || false,
      rateLimitPerUser: targetChannel.rateLimitPerUser || 0,
      permissionOverwrites: targetChannel.permissionOverwrites.cache.map(o => ({
        id: o.id,
        allow: o.allow.bitfield.toString(),
        deny: o.deny.bitfield.toString(),
        type: o.type,
      })),
    };

    try {
      // 💥 DELETE CHANNEL
      await targetChannel.delete(`Nuked by ${message.author.tag}`);

      // 🔁 RECREATE CHANNEL
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

      // 🔥 NUKE EMBED + GIF
      const embed = new EmbedBuilder()
        .setColor('#dc2626')
        .setDescription(`**${newChannel.name}** has been completely nuked.`)
        .setImage(NUKE_GIF);

      await newChannel.send({ embeds: [embed] });

    } catch (err) {
      console.error('Nuke error:', err);
      return message.channel.send('Nuke failed. Check logs.');
    }
  },
};