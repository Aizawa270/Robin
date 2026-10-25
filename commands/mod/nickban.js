const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  resolveMember,
} = require('../../handlers/universalHelper');

const TABLE_NAME = 'nickname_bans';

// ============================================================
// EMBED HELPER
// ============================================================

function buildEmbed(message, title, description) {
  if (typeof message.createEmbed === 'function') {
    return message.createEmbed({
      title,
      description,
    });
  }

  return new EmbedBuilder()
    .setColor('#5b0000')
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

// ============================================================
// DETECT WHICH ALIAS WAS USED
// The command handler resolves aliases to the same command.
// Read the original command name from the actual message.
// ============================================================

function getInvokedCommand(message) {
  const firstWord = String(message.content || '')
    .trim()
    .split(/\s+/, 1)[0]
    .toLowerCase();

  const prefix = String(message.prefix || '$').toLowerCase();

  if (firstWord.startsWith(prefix)) {
    return firstWord.slice(prefix.length);
  }

  return firstWord;
}

// ============================================================
// EXTRACT A USER ID FROM AN ID OR MENTION
// ============================================================

function extractUserId(input) {
  const value = String(input || '').trim();

  const mentionMatch = value.match(/^<@!?(\d+)>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  if (/^\d{15,22}$/.test(value)) {
    return value;
  }

  return null;
}

// ============================================================
// RESOLVE A MEMBER
// ============================================================

async function findMember(client, message, input) {
  try {
    if (typeof message.resolveMember === 'function') {
      return await message.resolveMember(input);
    }

    return await resolveMember(client, message, input);
  } catch (error) {
    return null;
  }
}

// ============================================================
// APPLY A SAVED NICKNAME
// ============================================================

async function restoreNickname(member, nickname, reason) {
  if (member.nickname === nickname) {
    return;
  }

  const botMember = member.guild.members.me;

  if (
    !botMember ||
    !botMember.permissions.has(
      PermissionFlagsBits.ManageNicknames
    )
  ) {
    throw new Error(
      'The bot is missing the Manage Nicknames permission.'
    );
  }

  if (!member.manageable) {
    throw new Error(
      'The member is above the bot in the role hierarchy.'
    );
  }

  await member.setNickname(
    nickname,
    reason
  );
}

// ============================================================
// COMMAND
// ============================================================

module.exports = {
  name: 'nickban',

  aliases: [
    'nicknameban',
    'nickunban',
    'nicknameunban',
  ],

  description: 'Restrict or restore a member nickname.',
  category: 'mod',
  usage: '$nickban <@user|userID> / $nickunban <@user|userID>',

  // ==========================================================
  // INITIALIZATION
  // Called from index.js when the bot becomes ready.
  // ==========================================================

  async init(client) {
    const db = client.automodDB;

    if (!db) {
      throw new Error(
        '[NickBan] client.automodDB is unavailable.'
      );
    }

    db.prepare(`
      CREATE TABLE IF NOT EXISTS nickname_bans (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        nickname TEXT,
        moderator_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
          DEFAULT (strftime('%s','now') * 1000),

        PRIMARY KEY (guild_id, user_id)
      )
    `).run();

    if (client.__nicknameBanListenerInstalled) {
      client.__nicknameBanSystemReady = true;
      return;
    }

    client.__nicknameBanListenerInstalled = true;

    const getBan = db.prepare(`
      SELECT nickname
      FROM nickname_bans
      WHERE guild_id = ? AND user_id = ?
    `);

    const getAllBans = db.prepare(`
      SELECT guild_id, user_id, nickname
      FROM nickname_bans
    `);

    const restoring = new Set();

    // ========================================================
    // DETECT MANUAL OR BOT-DRIVEN NICKNAME CHANGES
    // ========================================================

    client.on(
      'guildMemberUpdate',
      async (oldMember, newMember) => {
        try {
          // Ignore role changes and all other updates that
          // did not change the server nickname.
          if (
            oldMember.nickname === newMember.nickname
          ) {
            return;
          }

          const guildId = newMember.guild.id;
          const userId = newMember.id;
          const key = `${guildId}:${userId}`;

          if (restoring.has(key)) {
            return;
          }

          const restriction = getBan.get(
            guildId,
            userId
          );

          if (!restriction) {
            return;
          }

          const savedNickname =
            restriction.nickname ?? null;

          // The nickname is already the saved nickname.
          if (newMember.nickname === savedNickname) {
            return;
          }

          restoring.add(key);

          try {
            // Fetch the latest member state instead of relying
            // exclusively on a possibly stale event snapshot.
            const member = await newMember.guild.members
              .fetch(userId)
              .catch(() => newMember);

            // The restriction may have been removed while
            // this event was waiting.
            const currentRestriction = getBan.get(
              guildId,
              userId
            );

            if (!currentRestriction) {
              return;
            }

            const currentSavedNickname =
              currentRestriction.nickname ?? null;

            if (
              member.nickname === currentSavedNickname
            ) {
              return;
            }

            await restoreNickname(
              member,
              currentSavedNickname,
              'Restoring nickname because the member is nickname-banned'
            );

            console.log(
              `[NickBan] Restored nickname for ${userId} in ${guildId}`
            );
          } finally {
            restoring.delete(key);
          }
        } catch (error) {
          console.error(
            '[NickBan] Failed to enforce nickname restriction:',
            error
          );
        }
      }
    );

    // ========================================================
    // RE-ENFORCE RESTRICTIONS AFTER A BOT RESTART
    // ========================================================

    const records = getAllBans.all();

    for (const record of records) {
      try {
        const guild = client.guilds.cache.get(
          record.guild_id
        );

        if (!guild) {
          continue;
        }

        const member = await guild.members
          .fetch(record.user_id)
          .catch(() => null);

        if (!member) {
          continue;
        }

        if (member.nickname === record.nickname) {
          continue;
        }

        await restoreNickname(
          member,
          record.nickname ?? null,
          'Reapplying saved nickname restriction after restart'
        );

        console.log(
          `[NickBan] Reapplied nickname restriction for ${record.user_id}`
        );
      } catch (error) {
        console.error(
          `[NickBan] Could not restore nickname for ${record.user_id}:`,
          error.message
        );
      }
    }

    client.__nicknameBanSystemReady = true;

    console.log(
      `[NickBan] Initialized with ${records.length} saved restriction(s)`
    );
  },

  // ==========================================================
  // EXECUTE
  // ==========================================================

  async execute(client, message, args) {
    if (!message.guild || !message.member) {
      return;
    }

    // All commands and aliases in this file are administrator-only.
    if (
      !message.member.permissions.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Permission Denied',
            'You need the Administrator permission to use this command.'
          ),
        ],
      });
    }

    if (!client.__nicknameBanSystemReady) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'System Unavailable',
            'The nickname restriction system has not initialized yet.'
          ),
        ],
      });
    }

    const invokedCommand = getInvokedCommand(message);

    const isUnban = [
      'nickunban',
      'nicknameunban',
    ].includes(invokedCommand);

    if (!args[0]) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            isUnban ? 'Nickname Unban' : 'Nickname Ban',
            `Usage: \`${message.prefix || '$'}${isUnban ? 'nickunban' : 'nickban'} <@user|userID>\``
          ),
        ],
      });
    }

    const db = client.automodDB;

    const targetMember = await findMember(
      client,
      message,
      args[0]
    );

    const targetId =
      targetMember?.id ||
      extractUserId(args[0]);

    if (!targetId) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            isUnban ? 'Nickname Unban' : 'Nickname Ban',
            'Please provide a valid member mention, user ID, or username.'
          ),
        ],
      });
    }

    const displayName =
      targetMember?.user?.tag ||
      targetId;

    // ========================================================
    // NICKNAME UNBAN
    // ========================================================

    if (isUnban) {
      const result = db.prepare(`
        DELETE FROM nickname_bans
        WHERE guild_id = ? AND user_id = ?
      `).run(
        message.guild.id,
        targetId
      );

      if (result.changes === 0) {
        return message.reply({
          embeds: [
            buildEmbed(
              message,
              'Nickname Unban',
              `**${displayName}** does not have an active nickname restriction.`
            ),
          ],
        });
      }

      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Nickname Restriction Removed',
            `**${displayName}** can change their server nickname again.`
          ),
        ],
      });
    }

    // A member must currently be in the server to be nickbanned.
    if (!targetMember) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Nickname Ban',
            'I could not find that member in this server. To apply a nickname restriction, specify a member who is currently in the server.'
          ),
        ],
      });
    }

    // ========================================================
    // CHECK THE BOT'S PERMISSIONS AND ROLE HIERARCHY
    // ========================================================

    const botMember = message.guild.members.me;

    if (
      !botMember ||
      !botMember.permissions.has(
        PermissionFlagsBits.ManageNicknames
      )
    ) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Missing Permission',
            'I need the Manage Nicknames permission to enforce nickname restrictions.'
          ),
        ],
      });
    }

    if (!targetMember.manageable) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Role Hierarchy',
            'I cannot enforce this restriction because the member is above me in the server role hierarchy. Move my highest role above the member and try again.'
          ),
        ],
      });
    }

    const getExistingBan = db.prepare(`
      SELECT nickname
      FROM nickname_bans
      WHERE guild_id = ? AND user_id = ?
    `);

    const existingBan = getExistingBan.get(
      message.guild.id,
      targetId
    );

    // ========================================================
    // ALREADY RESTRICTED
    // Do not overwrite the originally saved nickname.
    // ========================================================

    if (existingBan) {
      try {
        await restoreNickname(
          targetMember,
          existingBan.nickname ?? null,
          'Reapplying existing nickname restriction'
        );
      } catch (error) {
        console.error(
          '[NickBan] Failed to restore an existing restriction:',
          error
        );
      }

      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Nickname Ban',
            `**${displayName}** already has an active nickname restriction. Their saved nickname remains unchanged.`
          ),
        ],
      });
    }

    // ========================================================
    // SAVE THE MEMBER'S CURRENT SERVER NICKNAME
    // SQLite preserves NULL if no server nickname was set.
    // ========================================================

    db.prepare(`
      INSERT OR IGNORE INTO nickname_bans (
        guild_id,
        user_id,
        nickname,
        moderator_id
      )
      VALUES (?, ?, ?, ?)
    `).run(
      message.guild.id,
      targetId,
      targetMember.nickname,
      message.author.id
    );

    return message.reply({
      embeds: [
        buildEmbed(
          message,
          'Nickname Restriction Enabled',
          `**${displayName}** is now nickname-banned.\n\nTheir current server nickname has been saved. If they try to change it manually or through a bot command, I will attempt to restore the saved nickname.\n\nUse \`${message.prefix || '$'}nickunban ${targetId}\` to remove the restriction.`
        ),
      ],
    });
  },
};