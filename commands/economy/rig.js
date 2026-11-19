
'use strict';

const { EmbedBuilder } = require('discord.js');

const {
  isBotOwner,
  armDiceRig,
  clearDiceRig,
} = require('./dice');

module.exports = {
  name: 'rig',
  aliases: [],
  description: 'Owner-only one-use dice rig.',
  category: 'owner',
  usage: '$rig dice @user',

  async execute(client, message, args) {

    // --------------------------------------------------------
    // SILENT VALIDATION
    // --------------------------------------------------------

    // No response for DMs or bot accounts.
    if (!message.guild) return;
    if (message.author?.bot) return;

    // Must have exactly two arguments.
    if (!Array.isArray(args) || args.length !== 2) {
      return;
    }

    // First argument must be "dice".
    if (String(args[0]).toLowerCase() !== 'dice') {
      return;
    }

    // Second argument must be a real Discord mention.
    const mentionMatch = String(args[1]).match(
      /^<@!?(\d+)>$/
    );

    if (!mentionMatch) return;

    const targetId = mentionMatch[1];

    const targetUser = message.mentions?.users?.get(
      targetId
    );

    if (!targetUser) return;

    // Do not rig bots.
    if (targetUser.bot) return;

    // Do not rig yourself.
    if (targetId === message.author.id) return;

    // --------------------------------------------------------
    // BOT OWNER VERIFICATION
    // --------------------------------------------------------

    let authorized = false;

    try {
      authorized = await isBotOwner(
        client,
        message.author.id
      );
    } catch (error) {
      console.error(
        '[Rig] Owner verification failed:',
        error?.message || error
      );

      return;
    }

    // Unauthorized users receive absolutely no response.
    if (!authorized) return;

    // --------------------------------------------------------
    // ARM THE RIG
    // --------------------------------------------------------

    const token = armDiceRig(
      message.guild.id,
      targetId
    );

    if (!token) return;

    // --------------------------------------------------------
    // SUCCESS EMBED
    // --------------------------------------------------------

    const embed = new EmbedBuilder()
      .setColor('#5b0000')
      .setTitle('🎲 Dice Rig Armed')
      .setDescription(
        `**Target:** ${targetUser.username}\n\n` +
        '**Rigged Odds**\n' +
        '• No match: **22%**\n' +
        '• One match: **53%**\n' +
        '• Two matches: **25%**\n\n' +
        '**Duration:** Next successfully settled dice game.'
      )
      .setThumbnail(
        targetUser.displayAvatarURL({
          size: 256,
        })
      )
      .setFooter({
        text: `Authorized by ${message.author.username}`,
      })
      .setTimestamp();

    // --------------------------------------------------------
    // SEND CONFIRMATION
    // --------------------------------------------------------

    let sentMessage;

    try {
      sentMessage = await message.reply({
        embeds: [embed],

        allowedMentions: {
          repliedUser: false,
          users: [],
        },
      });

    } catch (error) {
      // If the confirmation could not be sent,
      // remove this command's rig.
      clearDiceRig(
        message.guild.id,
        targetId,
        token
      );

      console.error(
        '[Rig] Could not send confirmation:',
        error?.message || error
      );

      return;
    }

    // --------------------------------------------------------
    // DELETE SUCCESS EMBED AFTER 4 SECONDS
    // --------------------------------------------------------

    setTimeout(() => {
      sentMessage.delete().catch(() => {});
    }, 4000);
  },
};
