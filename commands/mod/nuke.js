const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

const NUKE_ROLE_ID = '1447894643277561856';
const NUKE_GIF = 'https://tenor.com/bk6mI.gif';
const OWNER_ID = '852839588689870879';

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

    // ⚡ OWNER BYPASS - No confirmation needed
    if (message.author.id === OWNER_ID) {
      return await executeNuke(message, targetChannel, channelData);
    }

    // 📋 STEP 1 - First Confirmation
    const step1Embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle('⚠️ Nuke Confirmation - Step 1/2')
      .setDescription(
        `You are about to **nuke** ${targetChannel}.\n\n` +
        `This will **delete all messages** and recreate the channel.\n\n` +
        `React with ✅ to proceed to step 2.`
      )
      .setFooter({ text: 'You have 30 seconds to confirm' });

    const step1Msg = await message.reply({ embeds: [step1Embed] });
    await step1Msg.react('✅');

    // Wait for step 1 reaction
    const step1Filter = (reaction, user) => 
      reaction.emoji.name === '✅' && user.id === message.author.id;

    try {
      await step1Msg.awaitReactions({ 
        filter: step1Filter, 
        max: 1, 
        time: 30000, 
        errors: ['time'] 
      });
    } catch {
      step1Msg.edit({ 
        embeds: [step1Embed.setColor('#6b7280').setDescription('❌ Nuke cancelled - timed out.')] 
      });
      return;
    }

    // 📋 STEP 2 - Final Confirmation
    const step2Embed = new EmbedBuilder()
      .setColor('#dc2626')
      .setTitle('🚨 FINAL CONFIRMATION - Step 2/2')
      .setDescription(
        `**LAST CHANCE!**\n\n` +
        `Channel: ${targetChannel}\n` +
        `Action: **COMPLETE WIPE**\n\n` +
        `React with ☢️ to **NUKE** or ❌ to cancel.`
      )
      .setFooter({ text: 'This action cannot be undone | 30 seconds' });

    await step1Msg.edit({ embeds: [step2Embed] });
    await step1Msg.reactions.removeAll();
    await step1Msg.react('☢️');
    await step1Msg.react('❌');

    // Wait for step 2 reaction
    const step2Filter = (reaction, user) => 
      ['☢️', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;

    try {
      const collected = await step1Msg.awaitReactions({ 
        filter: step2Filter, 
        max: 1, 
        time: 30000, 
        errors: ['time'] 
      });

      const reaction = collected.first();

      if (reaction.emoji.name === '❌') {
        return step1Msg.edit({ 
          embeds: [step2Embed.setColor('#22c55e').setDescription('✅ Nuke cancelled successfully.')] 
        });
      }

      // ☢️ Execute nuke
      await step1Msg.delete().catch(() => {});
      await executeNuke(message, targetChannel, channelData);

    } catch {
      step1Msg.edit({ 
        embeds: [step2Embed.setColor('#6b7280').setDescription('❌ Nuke cancelled - timed out.')] 
      });
    }
  },
};

// 💥 NUKE EXECUTION FUNCTION
async function executeNuke(message, targetChannel, channelData) {
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
}
