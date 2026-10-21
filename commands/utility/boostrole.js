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

// ============================================================
// BOT OWNER / SERVER OWNER CHECK
// ============================================================

async function isBotOwner(client, userId) {
  // Optional explicit owner ID.
  if (
    process.env.BOT_OWNER_ID &&
    String(process.env.BOT_OWNER_ID) === String(userId)
  ) {
    return true;
  }

  try {
    if (!client.application?.owner) {
      await client.application?.fetch();
    }

    const owner = client.application?.owner;

    if (!owner) {
      return false;
    }

    // Normal application owner
    if (owner.user) {
      return owner.user.id === userId;
    }

    // Team owner
    if (owner.id) {
      return owner.id === userId;
    }

    return false;
  } catch (error) {
    console.error(
      '[Booster Roles] Bot owner check failed:',
      error
    );

    return false;
  }
}

async function isSetupAuthorized(client, message) {
  if (!message.guild) {
    return false;
  }

  // Server owner
  if (message.guild.ownerId === message.author.id) {
    return true;
  }

  // Bot owner
  return isBotOwner(client, message.author.id);
}

// ============================================================
// ROLE RESOLUTION
// Supports:
// @Role
// Role ID
// Exact role name
// ============================================================

function resolveRole(guild, input) {
  if (!input) {
    return null;
  }

  const cleaned = String(input)
    .trim()
    .replace(/^<@&(\d+)>$/, '$1');

  // Role ID
  if (/^\d{17,20}$/.test(cleaned)) {
    return guild.roles.cache.get(cleaned) || null;
  }

  // Exact role name
  return (
    guild.roles.cache.find(
      role => role.name.toLowerCase() === cleaned.toLowerCase()
    ) || null
  );
}

// ============================================================
// BOOSTER ROLE CONFIGURATION
// ============================================================

function ensureBoosterSettingsTable(database) {
  database.prepare(`
    CREATE TABLE IF NOT EXISTS booster_role_settings (
      guild_id TEXT PRIMARY KEY,
      member_category_role_id TEXT,
      staff_gate_role_id TEXT,
      staff_category_role_id TEXT
    )
  `).run();
}

function getBoosterSettings(database, guildId) {
  ensureBoosterSettingsTable(database);

  return database.prepare(`
    SELECT
      guild_id,
      member_category_role_id,
      staff_gate_role_id,
      staff_category_role_id
    FROM booster_role_settings
    WHERE guild_id = ?
  `).get(guildId) || null;
}

function saveMemberCategory(database, guildId, roleId) {
  ensureBoosterSettingsTable(database);

  database.prepare(`
    INSERT INTO booster_role_settings (
      guild_id,
      member_category_role_id
    )
    VALUES (?, ?)
    ON CONFLICT(guild_id)
    DO UPDATE SET
      member_category_role_id = excluded.member_category_role_id
  `).run(guildId, roleId);
}

function saveStaffSettings(
  database,
  guildId,
  staffGateRoleId,
  staffCategoryRoleId
) {
  ensureBoosterSettingsTable(database);

  database.prepare(`
    INSERT INTO booster_role_settings (
      guild_id,
      staff_gate_role_id,
      staff_category_role_id
    )
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id)
    DO UPDATE SET
      staff_gate_role_id = excluded.staff_gate_role_id,
      staff_category_role_id = excluded.staff_category_role_id
  `).run(
    guildId,
    staffGateRoleId,
    staffCategoryRoleId
  );
}

// ============================================================
// ROLE POSITIONING
// ============================================================

async function positionBoosterRole(
  boosterRole,
  categoryRole,
  reason
) {
  if (!boosterRole || !categoryRole) {
    throw new Error(
      'Booster role or category role is missing.'
    );
  }

  if (categoryRole.id === boosterRole.id) {
    throw new Error(
      'Booster role cannot be its own category.'
    );
  }

  if (categoryRole.managed) {
    throw new Error(
      'The configured category role is managed by Discord.'
    );
  }

  // The booster role must be immediately below the category.
  const targetPosition = categoryRole.position - 1;

  if (targetPosition < 1) {
    throw new Error(
      'The category role must be above @everyone.'
    );
  }

  await boosterRole.setPosition(
    targetPosition,
    reason
  );
}

// ============================================================
// BOT HIERARCHY CHECK
// ============================================================

function canBotManageCategory(guild, categoryRole) {
  const botMember = guild.members.me;

  if (!botMember) {
    return false;
  }

  if (!categoryRole) {
    return false;
  }

  return (
    !categoryRole.managed &&
    botMember.roles.highest.position >
      categoryRole.position
  );
}

function canBotCreateUnderCategory(
  guild,
  categoryRole
) {
  const botMember = guild.members.me;

  if (!botMember || !categoryRole) {
    return false;
  }

  return (
    botMember.roles.highest.position >
      categoryRole.position
  );
}

// ============================================================
// DATABASE OWNERSHIP
// ============================================================

function getRoleRecord(database, guildId, userId) {
  return database
    .prepare(`
      SELECT role_id
      FROM booster_roles
      WHERE guild_id = ? AND user_id = ?
    `)
    .get(guildId, userId);
}

function deleteRoleRecord(
  database,
  guildId,
  userId
) {
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

  let role = guild.roles.cache.get(
    record.role_id
  );

  if (!role) {
    try {
      role = await guild.roles.fetch(
        record.role_id
      );
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

// ============================================================
// HEX
// ============================================================

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

// ============================================================
// EMOJI
// ============================================================

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

  const name = (
    attachment.name || ''
  ).toLowerCase();

  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg')) return 'image/jpeg';
  if (name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.gif')) return 'image/gif';

  return null;
}

// ============================================================
// EDITABLE ROLE
// ============================================================

async function requireEditableRole(
  message,
  role
) {
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

// ============================================================
// HELP
// ============================================================

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

    `**${prefix}br setup <role/id>**`,
    'Sets the member booster-role category.',

    `**${prefix}br staffsetup <staff role> <category role>**`,
    'Sets up the staff booster-role category.',
  ].join('\n\n');
}

// ============================================================
// MODULE
// ============================================================

module.exports = {
  name: 'boostrole',

  aliases: ['br'],

  description:
    'Manage your personal server booster role.',

  category: 'utility',

  usage:
    'boostrole <create|rename|hex|icon|delete|setup|staffsetup>',

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

    ensureBoosterSettingsTable(database);

    const prefix =
      message.prefix ||
      client.getPrefix(message.guild.id) ||
      '$';

    const subcommand = (
      args[0] || ''
    ).toLowerCase();

    // ========================================================
    // SETUP
    // ========================================================

    if (subcommand === 'setup') {
      const authorized =
        await isSetupAuthorized(
          client,
          message
        );

      if (!authorized) {
        return sendEmbed(
          message,
          'Access Denied',
          'Only the server owner or Vanessa\'s bot owner can use this command.',
          'error'
        );
      }

      if (!hasManageRoles(message.guild)) {
        return sendEmbed(
          message,
          'Insufficient Permissions',
          'Vanessa needs the Manage Roles permission to configure booster roles.',
          'error'
        );
      }

      const categoryInput = args
        .slice(1)
        .join(' ')
        .trim();

      if (!categoryInput) {
        return sendEmbed(
          message,
          'Missing Role',
          [
            'Provide the role that booster roles should be placed under.',
            '',
            `**Example:** \`${prefix}br setup @Custom Roles\``,
            `**Or:** \`${prefix}br setup ROLE_ID\``,
          ].join('\n'),
          'error'
        );
      }

      const categoryRole =
        resolveRole(
          message.guild,
          categoryInput
        );

      if (!categoryRole) {
        return sendEmbed(
          message,
          'Role Not Found',
          'I could not find that role. Use a role mention, role ID, or the exact role name.',
          'error'
        );
      }

      if (categoryRole.managed) {
        return sendEmbed(
          message,
          'Invalid Category Role',
          'That role is managed by Discord and cannot be used as a booster-role category.',
          'error'
        );
      }

      if (
        !canBotManageCategory(
          message.guild,
          categoryRole
        )
      ) {
        return sendEmbed(
          message,
          'Role Hierarchy Error',
          [
            `Vanessa's highest role must be **above** ${categoryRole}.`,
            '',
            'Move Vanessa\'s bot role above the category role, then run setup again.',
          ].join('\n'),
          'error'
        );
      }

      saveMemberCategory(
        database,
        message.guild.id,
        categoryRole.id
      );

      return sendEmbed(
        message,
        'Member Booster Roles Configured',
        [
          `**Category:** ${categoryRole}`,
          '',
          'New member booster roles will automatically be placed immediately below this role.',
          '',
          'Your level roles and staff roles will not be used as placement targets.',
        ].join('\n'),
        'success'
      );
    }

    // ========================================================
    // STAFF SETUP
    // ========================================================

    if (subcommand === 'staffsetup') {
      const authorized =
        await isSetupAuthorized(
          client,
          message
        );

      if (!authorized) {
        return sendEmbed(
          message,
          'Access Denied',
          'Only the server owner or Vanessa\'s bot owner can use this command.',
          'error'
        );
      }

      if (!hasManageRoles(message.guild)) {
        return sendEmbed(
          message,
          'Insufficient Permissions',
          'Vanessa needs the Manage Roles permission to configure booster roles.',
          'error'
        );
      }

      if (args.length < 3) {
        return sendEmbed(
          message,
          'Missing Roles',
          [
            'You need to provide **two roles**:',
            '',
            '1. The staff role that identifies someone as staff.',
            '2. The staff booster-role category.',
            '',
            `**Example:** \`${prefix}br staffsetup @Staff @Staff Booster Roles\``,
            `**ID version:** \`${prefix}br staffsetup STAFF_ROLE_ID CATEGORY_ROLE_ID\``,
          ].join('\n'),
          'error'
        );
      }

      /*
       * Because role names can contain spaces, the cleanest
       * universal syntax is:
       *
       * br staffsetup @Staff @Staff Booster Roles
       *
       * Mentions are converted to IDs before resolution.
       *
       * We therefore first look for role mentions / IDs.
       */

      const mentionedRoles =
        message.mentions.roles;

      let staffGateRole = null;
      let staffCategoryRole = null;

      if (mentionedRoles.size >= 2) {
        const roles = [
          ...mentionedRoles.values(),
        ];

        staffGateRole = roles[0];
        staffCategoryRole = roles[1];
      } else if (args.length >= 3) {
        /*
         * ID-based syntax:
         * br staffsetup STAFF_ROLE_ID CATEGORY_ROLE_ID
         */

        staffGateRole =
          resolveRole(
            message.guild,
            args[1]
          );

        staffCategoryRole =
          resolveRole(
            message.guild,
            args[2]
          );
      }

      if (
        !staffGateRole ||
        !staffCategoryRole
      ) {
        return sendEmbed(
          message,
          'Invalid Staff Roles',
          [
            'Vanessa could not identify both roles.',
            '',
            'Use **two role mentions** for the safest setup:',
            `\`${prefix}br staffsetup @Staff @Staff-Booster-Category\``,
            '',
            'Or use two role IDs.',
          ].join('\n'),
          'error'
        );
      }

      if (
        staffGateRole.id ===
        staffCategoryRole.id
      ) {
        return sendEmbed(
          message,
          'Invalid Staff Setup',
          'The staff identification role and staff booster category cannot be the same role.',
          'error'
        );
      }

      if (
        staffCategoryRole.managed
      ) {
        return sendEmbed(
          message,
          'Invalid Category Role',
          'The staff booster category is managed by Discord and cannot be used.',
          'error'
        );
      }

      if (
        !canBotManageCategory(
          message.guild,
          staffCategoryRole
        )
      ) {
        return sendEmbed(
          message,
          'Role Hierarchy Error',
          [
            `Vanessa's highest role must be **above** ${staffCategoryRole}.`,
            '',
            'Move Vanessa\'s bot role above the staff booster category and run setup again.',
          ].join('\n'),
          'error'
        );
      }

      saveStaffSettings(
        database,
        message.guild.id,
        staffGateRole.id,
        staffCategoryRole.id
      );

      return sendEmbed(
        message,
        'Staff Booster Roles Configured',
        [
          `**Staff identification role:** ${staffGateRole}`,
          `**Staff booster category:** ${staffCategoryRole}`,
          '',
          `Anyone with ${staffGateRole} who boosts will have their personal booster role created under ${staffCategoryRole}.`,
          '',
          'Staff booster roles will therefore sit above the normal staff roles below the category.',
        ].join('\n'),
        'success'
      );
    }

    // ========================================================
    // HELP
    // ========================================================

    if (
      !subcommand ||
      subcommand === 'help'
    ) {
      return sendEmbed(
        message,
        'Booster Role Commands',
        buildHelpDescription(prefix)
      );
    }

    // ========================================================
    // FROM HERE DOWN, USER MUST BE A BOOSTER
    // ========================================================

    let member;

    try {
      member =
        await fetchRequesterMember(
          message
        );
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

    // ========================================================
    // CREATE
    // ========================================================

    if (subcommand === 'create') {
      try {
        const settings =
          getBoosterSettings(
            database,
            message.guild.id
          );

        const existingRole =
          await getOwnedBoosterRole(
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

          if (
            !member.roles.cache.has(
              existingRole.id
            )
          ) {
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

        // ====================================================
        // DETERMINE CATEGORY
        // ====================================================

        let categoryRole = null;
        let categoryType = 'member';

        // Staff takes priority.
        if (
          settings?.staff_gate_role_id &&
          settings?.staff_category_role_id &&
          member.roles.cache.has(
            settings.staff_gate_role_id
          )
        ) {
          categoryRole =
            message.guild.roles.cache.get(
              settings.staff_category_role_id
            );

          categoryType = 'staff';
        }

        // Normal member category.
        if (!categoryRole) {
          if (
            settings?.member_category_role_id
          ) {
            categoryRole =
              message.guild.roles.cache.get(
                settings.member_category_role_id
              );
          }
        }

        if (!categoryRole) {
          return sendEmbed(
            message,
            'Booster Role System Not Configured',
            [
              'This server has not configured a booster-role category yet.',
              '',
              `A server owner or Vanessa's bot owner must run:`,
              `\`${prefix}br setup @CategoryRole\``,
            ].join('\n'),
            'error'
          );
        }

        if (
          categoryRole.managed
        ) {
          return sendEmbed(
            message,
            'Invalid Booster Category',
            'The configured booster category role is managed by Discord and cannot be used.',
            'error'
          );
        }

        if (
          !canBotCreateUnderCategory(
            message.guild,
            categoryRole
          )
        ) {
          return sendEmbed(
            message,
            'Role Hierarchy Error',
            [
              `Vanessa's highest role must be above ${categoryRole}.`,
              '',
              'The bot cannot create and position a role underneath a role that is above the bot.',
            ].join('\n'),
            'error'
          );
        }

        const initialName =
          message.author.username.slice(
            0,
            100
          );

        let createdRole;

        try {
          createdRole =
            await message.guild.roles.create({
              name: initialName,
              permissions: [],
              mentionable: false,
              hoist: false,

              reason:
                `Personal ${categoryType} booster role for ${message.author.tag} (${message.author.id})`,
            });

          // IMPORTANT:
          // Immediately move the newly-created role directly
          // below the selected category.
          await positionBoosterRole(
            createdRole,
            categoryRole,
            `Positioning ${categoryType} booster role under its configured category`
          );

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
          [
            'Your personal booster role has been created successfully.',
            '',
            `**Role:** ${createdRole.name}`,
            `**Category:** ${categoryRole.name}`,
            `**Type:** ${categoryType === 'staff' ? 'Staff Booster' : 'Member Booster'}`,
          ].join('\n'),
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

    // ========================================================
    // FIND USER'S OWN ROLE
    // ========================================================

    let role;

    try {
      role =
        await getOwnedBoosterRole(
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
        [
          'You do not have a personal booster role yet.',
          '',
          `Use \`${prefix}br create\` to create one.`,
        ].join('\n'),
        'error'
      );
    }

    if (
      !(await requireEditableRole(
        message,
        role
      ))
    ) {
      return;
    }

    // ========================================================
    // RENAME
    // ========================================================

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

    // ========================================================
    // HEX / GRADIENT
    // ========================================================

    if (subcommand === 'hex') {
      const suppliedColors =
        args.slice(1);

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

      const colors =
        suppliedColors.map(validateHex);

      if (
        colors.some(
          color => !color
        )
      ) {
        return sendEmbed(
          message,
          'Invalid Color',
          'Each color must be a valid six-digit hexadecimal value, such as `#FF0000`.',
          'error'
        );
      }

      const isGradient =
        colors.length === 2;

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

    // ========================================================
    // ICON
    // ========================================================

    if (subcommand === 'icon') {
      const attachment =
        message.attachments.first();

      const iconInput =
        args
          .slice(1)
          .join(' ')
          .trim();

      // REMOVE

      if (
        iconInput.toLowerCase() ===
          'remove' ||
        iconInput.toLowerCase() ===
          'off'
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

      // IMAGE

      if (attachment) {
        const mimeType =
          attachmentMimeType(
            attachment
          );

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

      // NO INPUT

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
          ].join('\n')
        );
      }

      try {
        const customEmoji =
          parseCustomEmoji(
            iconInput
          );

        // CUSTOM EMOJI

        if (customEmoji) {
          const animated =
            customEmoji[1] === 'a';

          const emojiId =
            customEmoji[3];

          const extension =
            animated
              ? 'gif'
              : 'png';

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

        // UNICODE

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

    // ========================================================
    // DELETE
    // ========================================================

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

    // ========================================================
    // UNKNOWN
    // ========================================================

    return sendEmbed(
      message,
      'Unknown Booster Role Command',
      [
        'That subcommand does not exist.',
        '',
        buildHelpDescription(prefix),
      ].join('\n'),
      'error'
    );
  },
};