const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');
const { resolveUser } = require('../../handlers/universalHelper');

function makeEmbed(color, title, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

module.exports = {
  name: 'unban',
  description: 'Unban a user by ID, mention, username, or tag.',
  category: 'mod',
  usage: '$unban <userID|@user|username>',

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Unban Failed',
            'This command can only be used inside a server.'
          )
        ]
      });
    }

    // Permission
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Unban Failed',
            'You need the **Ban Members** permission.'
          )
        ]
      });
    }

    const prefix = client.getPrefix
      ? client.getPrefix(message.guild.id)
      : '$';

    if (!args.length) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#fde047',
            'Unban Usage',
            `**Usage:**\n\`${prefix}unban <userID|@user|username>\`\n\nExamples:\n\`${prefix}unban 123456789012345678\`\n\`${prefix}unban @User\`\n\`${prefix}unban Username\``
          )
        ]
      });
    }

    try {
      // Universal resolver
      const user = await resolveUser(
        client,
        message,
        args.join(' ')
      );

      let userId;

      if (user) {
        userId = user.id;
      } else if (/^\d{15,20}$/.test(args[0])) {
        userId = args[0];
      }

      if (!userId) {
        return message.reply({
          embeds: [
            makeEmbed(
              '#f59e0b',
              'Unban Failed',
              'Could not find that user. Provide a valid ID, mention, username, or tag.'
            )
          ]
        });
      }


      // Check ban
      const banInfo = await message.guild.bans.fetch(userId).catch(() => null);

      if (!banInfo) {
        return message.reply({
          embeds: [
            makeEmbed(
              '#f59e0b',
              'User Not Banned',
              `<@${userId}> is not banned or the ID is invalid.`
            )
          ]
        });
      }


      // Remove ban
      await message.guild.bans.remove(
        userId,
        `Unbanned by ${message.author.tag}`
      );


      // Mod stats logging
      try {
        logModAction(
          client,
          message.guild.id,
          message.author.id,
          userId,
          'unban',
          'User unbanned'
        );
      } catch (err) {
        console.error('[Unban] Mod stats error:', err);
      }


      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('User Unbanned')
        .addFields(
          {
            name: 'User',
            value: `<@${banInfo.user.id}>`,
            inline: true
          },
          {
            name: 'ID',
            value: `\`${banInfo.user.id}\``,
            inline: true
          },
          {
            name: 'Moderator',
            value: `<@${message.author.id}>`,
            inline: true
          },
          {
            name: 'Previous Ban Reason',
            value: banInfo.reason || 'No reason provided',
            inline: false
          }
        )
        .setTimestamp();

      return message.reply({
        embeds: [embed]
      });


    } catch (err) {
      console.error('[Unban] Error:', err);

      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Unban Failed',
            'Something went wrong while trying to unban this user.'
          )
        ]
      });
    }
  }
};