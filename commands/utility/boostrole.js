const {
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

const EMBED_COLOR = '#8b2e2e';

const STATUS_COLORS = {
  success: '#386641',
  error: '#9d3434',
  info: EMBED_COLOR,
};

function buildEmbed(
  title,
  description,
  status = 'info',
  guildName = 'Server'
) {
  return new EmbedBuilder()
    .setColor(STATUS_COLORS[status] || EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: `${guildName} | Booster Roles`,
    });
}

async function sendEmbed(
  message,
  title,
  description,
  status = 'info'
) {
  return message.reply({
    embeds: [
      buildEmbed(
        title,
        description,
        status,
        message.guild?.name || 'Server'
      ),
    ],
    allowedMentions: {
      repliedUser: false,
    },
  });
}

function getDatabase(client) {
  return client.boosterRolesDB || null;
}

function hasManageRoles(guild) {
  const botMember = guild.members.me;

  return Boolean(
    botMember &&
    botMember.permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )
  );
}

async function fetchRequesterMember(message) {
  return message.guild.members.fetch({
    user: message.author.id,
    force: true,
  });
}

function getRoleRecord(database, guildId, userId) {
  return database
    .prepare(`
      SELECT role_id
      FROM booster_roles
      WHERE guild_id = ? AND user_id = ?
    `)
    .get(guildId, userId);
}

function deleteRoleRecord(database, guildId, userId) {
  database.prepare(`
    DELETE FROM booster_roles
    WHERE guild_id = ? AND user_id = ?
  `).run(guildId, userId);
}

async function getOwnedBoosterRole(
  guild,
  database,
  userId
) {
  const record = getRoleRecord(
    database,
    guild.id,
    userId
  );

  if (!record) {
    return null;
  }

  let role = guild.roles.cache.get(record.role_id);

  if (!role) {
    try {
      role = await guild.roles.fetch(record.role_id);
    } catch (error) {
      if (
        Number(error.code) === 10011 ||
        Number(error.status) === 404
      ) {
        deleteRoleRecord(
          database,
          guild.id,
          userId
        );

        return null;
      }

      throw error;
    }
  }

  if (!role) {
    deleteRoleRecord(
      database,
      guild.id,
      userId
    );

    return null;
  }

  return role;
}

function validateHex(input) {
  const normalized = String(input || '')
    .trim()
    .replace(/^#/, '')
    .toUpperCase();

  if (!/^[0-9A-F]{6}$/.test(normalized)) {
    return null;
  }

  return `#${normalized}`;
}

function parseCustomEmoji(input) {
  return input.match(
    /^<(a?):([A-Za-z0-9_]+):(\d+)>$/
  );
}

function attachmentMimeType(attachment) {
  if (attachment.contentType) {
    return attachment.contentType
      .split(';')[0]
      .trim()
      .toLowerCase();
  }

  const name = (attachment.name || '').toLowerCase();

  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg')) return 'image/jpeg';
  if (name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.gif')) return 'image/gif';

  return null;
}

async function requireEditableRole(message, role) {
  if (!hasManageRoles(message.guild)) {
    await sendEmbed(
      message,
      'Insufficient Permissions',
      'Vanessa needs the Manage Roles permission to manage booster roles.',
      'error'
    );

    return false;
  }

  if (!role.editable) {
    await sendEmbed(
      message,
      'Role Cannot Be Modified',
      'Vanessa cannot manage this role. Make sure her highest role is above the booster role.',
      'error'
    );

    return false;
  }

  return true;
}

function buildHelpDescription(prefix) {
  return [
    `**${prefix}boostrole create**`,
    'Creates your personal booster role.',

    `**${prefix}boostrole rename <name>**`,
    'Changes your booster role name.',

    `**${prefix}boostrole hex <color>**`,
    'Sets a solid role color.',

    `**${prefix}boostrole hex <color1> <color2>**`,
    'Sets a gradient role color.',

    `**${prefix}boostrole icon <emoji>**`,
    'Sets your role icon using a Unicode or custom emoji.',

    `**${prefix}boostrole icon**`,
    'Attach an image to set your role icon.',

    `**${prefix}boostrole icon remove**`,
    'Removes your current role icon.',

    `**${prefix}boostrole delete**`,
    'Deletes your personal booster role.',
  ].join('\n\n');
}

module.exports = {
  name: 'boostrole',

  aliases: ['br'],

  description: 'Manage your personal server booster role.',

  category: 'utility',

  usage: 'boostrole <create|rename|hex|icon|delete>',

  async execute(client, message, args) {
    if (!message.guild) {
      return sendEmbed(
        message,
        'Server Only',
        'This command can only be used inside a server.',
        'error'
      );
    }

    const database = getDatabase(client);

    if (!database) {
      console.error(
        '[Booster Roles] Database has not been initialized.'
      );

      return sendEmbed(
        message,
        'System Unavailable',
        'The booster-role system is currently unavailable. Please contact a server administrator.',
        'error'
      );
    }

    const prefix =
      message.prefix ||
      client.getPrefix(message.guild.id) ||
      '$';

    // Verify current boosting status.
    let member;

    try {
      member = await fetchRequesterMember(message);
    } catch (error) {
      console.error(
        '[Booster Roles] Could not fetch member:',
        error
      );

      return sendEmbed(
        message,
        'Verification Failed',
        'Vanessa could not verify your current boosting status. Please try again.',
        'error'
      );
    }

    if (!member.premiumSince) {
      return sendEmbed(
        message,
        'Booster Only',
        'This command is available exclusively to members currently boosting this server.',
        'error'
      );
    }

    if (!hasManageRoles(message.guild)) {
      return sendEmbed(
        message,
        'Insufficient Permissions',
        'Vanessa needs the Manage Roles permission to manage booster roles.',
        'error'
      );
    }

    const subcommand = (
      args[0] || ''
    ).toLowerCase();

    // ==========================================
    // HELP
    // ==========================================

    if (!subcommand || subcommand === 'help') {
      return sendEmbed(
        message,
        'Booster Role Commands',
        buildHelpDescription(prefix)
      );
    }

    // ==========================================
    // CREATE
    // ==========================================

    if (subcommand === 'create') {
      try {
        const existingRole = await getOwnedBoosterRole(
          message.guild,
          database,
          message.author.id
        );

        if (existingRole) {
          if (!existingRole.editable) {
            return sendEmbed(
              message,
              'Role Cannot Be Modified',
              'Vanessa cannot manage your existing booster role. Check her role hierarchy.',
              'error'
            );
          }

          if (!member.roles.cache.has(existingRole.id)) {
            await member.roles.add(
              existingRole,
              'Restoring the member’s personal booster role'
            );

            return sendEmbed(
              message,
              'Booster Role Restored',
              `Your existing booster role **${existingRole.name}** has been assigned to you again.`,
              'success'
            );
          }

          return sendEmbed(
            message,
            'Booster Role',
            `You already have a personal booster role: **${existingRole.name}**.`
          );
        }

        const initialName = message.author.username.slice(
          0,
          100
        );

        let createdRole;

        try {
          createdRole = await message.guild.roles.create({
            name: initialName,
            permissions: [],
            mentionable: false,
            hoist: false,

            reason:
              `Personal booster role for ${message.author.tag} (${message.author.id})`,
          });

          await member.roles.add(
            createdRole,
            'Assigning a personal booster role'
          );

          database.prepare(`
            INSERT INTO booster_roles (
              guild_id,
              user_id,
              role_id
            )
            VALUES (?, ?, ?)
          `).run(
            message.guild.id,
            message.author.id,
            createdRole.id
          );

        } catch (error) {
          if (createdRole) {
            await createdRole.delete(
              'Cleaning up an unsuccessful booster-role creation'
            ).catch(deleteError => {
              console.error(
                '[Booster Roles] Cleanup failed:',
                deleteError
              );
            });
          }

          throw error;
        }

        return sendEmbed(
          message,
          'Booster Role Created',
          `Your personal booster role has been created successfully.\n\n**Role:** ${createdRole.name}`,
          'success'
        );

      } catch (error) {
        console.error(
          '[Booster Roles] Create failed:',
          error
        );

        return sendEmbed(
          message,
          'Creation Failed',
          'Vanessa could not create your booster role. Check the bot’s permissions and role hierarchy.',
          'error'
        );
      }
    }

    // ==========================================
    // FIND THE USER'S OWN ROLE
    // ==========================================

    let role;

    try {
      role = await getOwnedBoosterRole(
        message.guild,
        database,
        message.author.id
      );
    } catch (error) {
      console.error(
        '[Booster Roles] Role lookup failed:',
        error
      );

      return sendEmbed(
        message,
        'System Error',
        'Vanessa could not retrieve your booster role. Please try again.',
        'error'
      );
    }

    if (!role) {
      return sendEmbed(
        message,
        'Booster Role Not Found',
        `You do not have a personal booster role yet.\n\nUse \`${prefix}br create\` to create one.`,
        'error'
      );
    }

    if (!(await requireEditableRole(message, role))) {
      return;
    }

    // ==========================================
    // RENAME
    // ==========================================

    if (subcommand === 'rename') {
      const newName = args
        .slice(1)
        .join(' ')
        .trim();

      if (!newName) {
        return sendEmbed(
          message,
          'Invalid Role Name',
          `Provide the new name for your role.\n\nExample: \`${prefix}br rename Shadow\``,
          'error'
        );
      }

      if (newName.length > 100) {
        return sendEmbed(
          message,
          'Invalid Role Name',
          'Role names cannot exceed 100 characters.',
          'error'
        );
      }

      try {
        await role.setName(
          newName,
          `Booster role renamed by ${message.author.tag}`
        );

        return sendEmbed(
          message,
          'Booster Role Updated',
          `Your booster role has been renamed to **${newName}**.`,
          'success'
        );
      } catch (error) {
        console.error(
          '[Booster Roles] Rename failed:',
          error
        );

        return sendEmbed(
          message,
          'Update Failed',
          'Vanessa could not rename your booster role.',
          'error'
        );
      }
    }

    // ==========================================
    // HEX COLOR / GRADIENT
    // ==========================================

    if (subcommand === 'hex') {
      const suppliedColors = args.slice(1);

      if (
        suppliedColors.length < 1 ||
        suppliedColors.length > 2
      ) {
        return sendEmbed(
          message,
          'Invalid Color',
          [
            'Provide one or two hexadecimal colors.',
            '',
            `**Solid color:** \`${prefix}br hex #FF0000\``,
            `**Gradient:** \`${prefix}br hex #FF0000 #0000FF\``,
          ].join('\n'),
          'error'
        );
      }

      const colors = suppliedColors.map(validateHex);

      if (colors.some(color => !color)) {
        return sendEmbed(
          message,
          'Invalid Color',
          'Each color must be a valid six-digit hexadecimal value, such as `#FF0000`.',
          'error'
        );
      }

      const isGradient = colors.length === 2;

      if (
        isGradient &&
        !message.guild.features.includes(
          'ENHANCED_ROLE_COLORS'
        )
      ) {
        return sendEmbed(
          message,
          'Gradient Colors Unavailable',
          'Enhanced Role Styles are not enabled for this server. A server owner or administrator must enable the required feature before gradient colors can be applied.',
          'error'
        );
      }

      try {
        if (isGradient) {
          await role.setColors({
            primaryColor: colors[0],
            secondaryColor: colors[1],
          });

          return sendEmbed(
            message,
            'Booster Role Updated',
            [
              'Your booster role gradient has been updated.',
              '',
              `**First color:** ${colors[0]}`,
              `**Second color:** ${colors[1]}`,
            ].join('\n'),
            'success'
          );
        }

        await role.setColors({
          primaryColor: colors[0],
          secondaryColor: null,
        });

        return sendEmbed(
          message,
          'Booster Role Updated',
          `Your booster role color has been changed to **${colors[0]}**.`,
          'success'
        );

      } catch (error) {
        console.error(
          '[Booster Roles] Color update failed:',
          error
        );

        return sendEmbed(
          message,
          'Color Update Failed',
          'Vanessa could not update the role color. Verify that your server supports the requested style and that Vanessa can manage the role.',
          'error'
        );
      }
    }

    // ==========================================
    // ROLE ICON
    // ==========================================

    if (subcommand === 'icon') {
      const attachment = message.attachments.first();

      const iconInput = args
        .slice(1)
        .join(' ')
        .trim();

      // REMOVE ICON

      if (
        iconInput.toLowerCase() === 'remove' ||
        iconInput.toLowerCase() === 'off'
      ) {
        try {
          await role.setIcon(
            null,
            `Booster role icon removed by ${message.author.tag}`
          );

          await role.setUnicodeEmoji(
            null,
            `Booster role Unicode emoji removed by ${message.author.tag}`
          );

          return sendEmbed(
            message,
            'Booster Role Updated',
            'Your booster role icon has been removed.',
            'success'
          );

        } catch (error) {
          console.error(
            '[Booster Roles] Icon removal failed:',
            error
          );

          return sendEmbed(
            message,
            'Icon Removal Failed',
            'Vanessa could not remove your booster role icon.',
            'error'
          );
        }
      }

      // IMAGE ATTACHMENT

      if (attachment) {
        const mimeType = attachmentMimeType(attachment);

        if (
          ![
            'image/png',
            'image/jpeg',
            'image/gif',
          ].includes(mimeType)
        ) {
          return sendEmbed(
            message,
            'Invalid Icon',
            'Attach a PNG, JPG, or GIF image.',
            'error'
          );
        }

        try {
          await role.setUnicodeEmoji(
            null,
            'Replacing booster role emoji with an image'
          );

          await role.setIcon(
            attachment.url,
            `Booster role image updated by ${message.author.tag}`
          );

          return sendEmbed(
            message,
            'Booster Role Updated',
            'Your booster role icon has been updated successfully.',
            'success'
          );

        } catch (error) {
          console.error(
            '[Booster Roles] Image icon failed:',
            error
          );

          return sendEmbed(
            message,
            'Icon Update Failed',
            'Vanessa could not set this image as your role icon. Try a smaller PNG, JPG, or GIF image.',
            'error'
          );
        }
      }

      // EMOJI INPUT

      if (!iconInput) {
        return sendEmbed(
          message,
          'Set Booster Role Icon',
          [
            '**Unicode emoji:**',
            `\`${prefix}br icon 🔥\``,
            '',
            '**Custom or Nitro emoji:**',
            'Use the actual custom emoji in the command.',
            '',
            '**Image:**',
            'Attach an image to the command.',
            '',
            `**Remove icon:** \`${prefix}br icon remove\``,
          ].join('\n'),
          'info'
        );
      }

      try {
        const customEmoji = parseCustomEmoji(iconInput);

        // CUSTOM EMOJI

        if (customEmoji) {
          const animated = customEmoji[1] === 'a';
          const emojiId = customEmoji[3];

          const extension = animated ? 'gif' : 'png';

          const emojiUrl =
            `https://cdn.discordapp.com/emojis/${emojiId}.${extension}?size=128&quality=lossless`;

          await role.setUnicodeEmoji(
            null,
            'Replacing booster role Unicode emoji'
          );

          await role.setIcon(
            emojiUrl,
            `Booster role custom emoji updated by ${message.author.tag}`
          );

          return sendEmbed(
            message,
            'Booster Role Updated',
            'Your booster role icon has been updated successfully.',
            'success'
          );
        }

        // DEFAULT UNICODE EMOJI

        await role.setIcon(
          null,
          'Replacing booster role image icon'
        );

        await role.setUnicodeEmoji(
          iconInput,
          `Booster role emoji updated by ${message.author.tag}`
        );

        return sendEmbed(
          message,
          'Booster Role Updated',
          'Your booster role icon has been updated successfully.',
          'success'
        );

      } catch (error) {
        console.error(
          '[Booster Roles] Emoji icon failed:',
          error
        );

        return sendEmbed(
          message,
          'Invalid Icon',
          'Vanessa could not use that emoji as a role icon. Try a standard Unicode emoji, an accessible custom emoji, or an image attachment.',
          'error'
        );
      }
    }

    // ==========================================
    // DELETE
    // ==========================================

    if (subcommand === 'delete') {
      try {
        await role.delete(
          `Personal booster role deleted by ${message.author.tag}`
        );

        deleteRoleRecord(
          database,
          message.guild.id,
          message.author.id
        );

        return sendEmbed(
          message,
          'Booster Role Deleted',
          'Your personal booster role has been deleted.',
          'success'
        );

      } catch (error) {
        console.error(
          '[Booster Roles] Delete failed:',
          error
        );

        return sendEmbed(
          message,
          'Deletion Failed',
          'Vanessa could not delete your booster role. Check the bot’s permissions and role hierarchy.',
          'error'
        );
      }
    }

    // UNKNOWN SUBCOMMAND

    return sendEmbed(
      message,
      'Unknown Booster Role Command',
      `That subcommand does not exist.\n\n${buildHelpDescription(prefix)}`,
      'error'
    );
  },
};