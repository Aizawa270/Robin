const {
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

module.exports = {
  name: 'setroleicon',
  description: 'Set a role icon using an image or emoji.',
  category: 'utility',
  usage: '$sri <role/id> <emoji> OR attach an image',
  aliases: ['sri'],

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply(
        '❌ This command only works in servers.'
      );
    }

    // Check the user's permissions.
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.ManageRoles
      )
    ) {
      return message.reply(
        '❌ You need the **Manage Roles** permission.'
      );
    }

    // Resolve the role from a mention or ID.
    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(args[0]);

    if (!role) {
      return message.reply(
        '❌ Please mention a valid role or provide its ID.'
      );
    }

    // Check whether the bot can edit this role.
    if (!role.editable) {
      return message.reply(
        '❌ I cannot edit this role. Make sure my highest role is above the target role and I have Manage Roles permission.'
      );
    }

    try {
      // ==========================================
      // OPTION 1: SET ICON USING AN ATTACHED IMAGE
      // ==========================================

      const attachment = message.attachments.first();

      if (attachment) {
        const contentType = attachment.contentType
          ?.split(';')[0]
          .toLowerCase();

        if (
          ![
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/gif',
          ].includes(contentType)
        ) {
          return message.reply(
            '❌ Invalid file type. Only PNG, JPG, and GIF are allowed.'
          );
        }

        await role.setIcon(
          attachment.url,
          `Updated by ${message.author.tag}`
        );

        const embed = new EmbedBuilder()
          .setColor(role.hexColor || '#ffffff')
          .setDescription(
            `✅ Icon image for **${role.name}** has been updated successfully.`
          );

        return message.reply({
          embeds: [embed],
        });
      }

      // ==========================================
      // OPTION 2: SET ICON USING AN EMOJI
      // ==========================================

      // Everything after the role argument is the emoji.
      const emojiInput = args.slice(1).join(' ').trim();

      if (!emojiInput) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#8b2e2e')
              .setTitle('Set Role Icon')
              .setDescription(
                [
                  '**Usage:**',
                  '`!sri @Role 😀`',
                  '`!sri ROLE_ID 😀`',
                  '',
                  '**Custom server emoji:**',
                  '`!sri @Role <:emoji_name:emoji_id>`',
                  '',
                  '**Image:**',
                  'Mention the role and attach an image.',
                  '',
                  'Default emojis and static custom emojis from this server are supported.',
                ].join('\n')
              ),
          ],
        });
      }

      // Match a Discord custom emoji:
      // <:name:id> or <a:name:id>
      const customEmojiMatch = emojiInput.match(
        /^<(a?):([A-Za-z0-9_]+):(\d+)>$/
      );

      // ------------------------------------------
      // CUSTOM SERVER EMOJI
      // ------------------------------------------

      if (customEmojiMatch) {
        const isAnimated = customEmojiMatch[1] === 'a';
        const emojiId = customEmojiMatch[3];

        if (isAnimated) {
          return message.reply(
            '❌ Animated emojis cannot be used as role icons. Please use a static custom emoji or a default emoji.'
          );
        }

        // The custom emoji must belong to this server.
        const serverEmoji =
          message.guild.emojis.cache.get(emojiId);

        if (!serverEmoji) {
          return message.reply(
            '❌ That custom emoji is not from this server. Nitro emojis from other servers cannot be used directly as role icons.'
          );
        }

        if (serverEmoji.animated) {
          return message.reply(
            '❌ Animated emojis cannot be used as role icons. Please use a static emoji.'
          );
        }

        // Convert the static custom emoji into an image icon.
        const emojiImageURL = serverEmoji.imageURL({
          extension: 'png',
          size: 64,
        });

        await role.setIcon(
          emojiImageURL,
          `Emoji icon updated by ${message.author.tag}`
        );

        const embed = new EmbedBuilder()
          .setColor(role.hexColor || '#ffffff')
          .setDescription(
            `✅ Custom emoji icon for **${role.name}** has been updated successfully.`
          );

        return message.reply({
          embeds: [embed],
        });
      }

      // ------------------------------------------
      // DEFAULT UNICODE EMOJI
      // ------------------------------------------

      await role.setUnicodeEmoji(
        emojiInput,
        `Emoji icon updated by ${message.author.tag}`
      );

      const embed = new EmbedBuilder()
        .setColor(role.hexColor || '#ffffff')
        .setDescription(
          `✅ Emoji icon for **${role.name}** has been updated to ${emojiInput}.`
        );

      return message.reply({
        embeds: [embed],
      });

    } catch (err) {
      console.error('SetRoleIcon error:', err);

      return message.reply(
        [
          '❌ Failed to set the role icon.',
          '',
          'Check that:',
          '• Your server supports role icons.',
          '• The bot has Manage Roles permission.',
          '• The bot’s highest role is above the target role.',
          '• The emoji or image is valid.',
        ].join('\n')
      );
    }
  },
};