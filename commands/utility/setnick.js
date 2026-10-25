const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  colors,
} = require('../../config');

const {
  resolveMember,
} = require('../../handlers/universalHelper');

module.exports = {
  name: 'setnick',

  description: 'Change the nickname of a user.',
  category: 'mod',

  usage: '$setnick <@user|userID|username> <new nickname>',

  aliases: ['nick'],

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply(
        'This command can only be used in a server.'
      );
    }

    if (
      !message.member.permissions.has(
        PermissionFlagsBits.ManageNicknames
      )
    ) {
      return message.reply(
        'You need the "Manage Nicknames" permission to use this command.'
      );
    }

    if (!args.length) {
      return message.reply(
        `Usage: \`${message.prefix || '$'}setnick <@user|userID|username> <new nickname>\``
      );
    }

    const targetMember = await resolveMember(
      client,
      message,
      args[0]
    );

    if (!targetMember) {
      return message.reply(
        'Please specify a valid user by mention, ID, or exact username.'
      );
    }

    const newNick = args
      .slice(1)
      .join(' ')
      .trim();

    if (!newNick) {
      return message.reply(
        'Please provide a new nickname.'
      );
    }

    // ========================================================
    // NICKNAME BAN CHECK
    // Don't allow this bot command to bypass nickban.
    // ========================================================

    if (!client.automodDB) {
      console.error(
        '[SetNick] The automod database is unavailable.'
      );

      return message.reply(
        'I could not verify nickname restrictions. Please try again later.'
      );
    }

    let restriction;

    try {
      restriction = client.automodDB.prepare(`
        SELECT nickname
        FROM nickname_bans
        WHERE guild_id = ? AND user_id = ?
      `).get(
        message.guild.id,
        targetMember.id
      );
    } catch (error) {
      console.error(
        '[SetNick] Failed to check nickname restrictions:',
        error
      );

      return message.reply(
        'I could not verify nickname restrictions. Please try again later.'
      );
    }

    if (restriction) {
      return message.reply(
        `**${targetMember.user.tag}** is nickname-banned. Their nickname cannot be changed until they are unbanned with \`${message.prefix || '$'}nickunban\`.`
      );
    }

    if (!targetMember.manageable) {
      return message.reply(
        'I cannot change the nickname of this user (role hierarchy).'
      );
    }

    try {
      await targetMember.setNickname(
        newNick,
        `Changed by ${message.author.tag}`
      );

      const embed = new EmbedBuilder()
        .setColor(colors.roleinfo || '#00ffff')
        .setTitle('Nickname Changed')
        .setDescription(
          `**${targetMember.user.tag}** has had their nickname changed to **${newNick}**.`
        )
        .setThumbnail(
          targetMember.user.displayAvatarURL({
            size: 1024,
          })
        )
        .setTimestamp()
        .setFooter({
          text: `Changed by ${message.author.tag}`,
        });

      return message.reply({
        embeds: [embed],
      });
    } catch (error) {
      console.error(
        'SetNick error:',
        error
      );

      return message.reply(
        'There was an error trying to change that nickname.'
      );
    }
  },
};