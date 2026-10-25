const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  resolveMember,
} = require('../../handlers/universalHelper');

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
// COMMAND
// ============================================================

module.exports = {
  name: 'reactionban',

  aliases: [
    'reactionunban',
  ],

  description: 'Restrict or restore a member reaction access.',
  category: 'mod',
  usage: '$reactionban <@user|userID> / $reactionunban <@user|userID>',

  // ==========================================================
  // INITIALIZATION
  // ==========================================================

  async init(client) {
    const db = client.automodDB;

    if (!db) {
      throw new Error(
        '[ReactionBan] client.automodDB is unavailable.'
      );
    }

    db.prepare(`
      CREATE TABLE IF NOT EXISTS reaction_bans (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
          DEFAULT (strftime('%s','now') * 1000),

        PRIMARY KEY (guild_id, user_id)
      )
    `).run();

    if (client.__reactionBanListenerInstalled) {
      client.__reactionBanSystemReady = true;
      return;
    }

    client.__reactionBanListenerInstalled = true;

    const getBan = db.prepare(`
      SELECT user_id
      FROM reaction_bans
      WHERE guild_id = ? AND user_id = ?
    `);

    // ========================================================
    // REMOVE REACTIONS FROM RESTRICTED MEMBERS
    // ========================================================

    client.on(
      'messageReactionAdd',
      async (reaction, user) => {
        try {
          if (!user || user.bot) {
            return;
          }

          let currentReaction = reaction;

          // Fetch partial reactions when necessary.
          if (currentReaction.partial) {
            try {
              currentReaction = await currentReaction.fetch();
            } catch (error) {
              return;
            }
          }

          const reactionMessage = currentReaction.message;

          let guild = reactionMessage.guild;

          if (!guild && reactionMessage.guildId) {
            guild =
              client.guilds.cache.get(
                reactionMessage.guildId
              ) ||
              await client.guilds
                .fetch(reactionMessage.guildId)
                .catch(() => null);
          }

          if (!guild) {
            return;
          }

          const restriction = getBan.get(
            guild.id,
            user.id
          );

          if (!restriction) {
            return;
          }

          // Make sure the latest message information is available.
          if (reactionMessage.partial) {
            try {
              await reactionMessage.fetch();
            } catch (error) {
              return;
            }
          }

          const botMember = guild.members.me;

          if (!botMember) {
            return;
          }

          const channelPermissions =
            reactionMessage.channel?.permissionsFor(
              botMember
            );

          if (
            !channelPermissions?.has(
              PermissionFlagsBits.ManageMessages
            )
          ) {
            console.warn(
              `[ReactionBan] Missing Manage Messages permission in channel ${reactionMessage.channel?.id || 'unknown'}`
            );

            return;
          }

          // Remove only the restricted user's reaction.
          await currentReaction.users.remove(
            user.id,
            'Removing reaction from a reaction-restricted member'
          );
        } catch (error) {
          console.error(
            '[ReactionBan] Failed to remove restricted reaction:',
            error
          );
        }
      }
    );

    client.__reactionBanSystemReady = true;

    console.log('[ReactionBan] Initialized');
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

    if (!client.__reactionBanSystemReady) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'System Unavailable',
            'The reaction restriction system has not initialized yet.'
          ),
        ],
      });
    }

    const invokedCommand = getInvokedCommand(message);
    const isUnban = invokedCommand === 'reactionunban';

    if (!args[0]) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            isUnban ? 'Reaction Unban' : 'Reaction Ban',
            `Usage: \`${message.prefix || '$'}${isUnban ? 'reactionunban' : 'reactionban'} <@user|userID>\``
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
            isUnban ? 'Reaction Unban' : 'Reaction Ban',
            'Please provide a valid member mention, user ID, or username.'
          ),
        ],
      });
    }

    const displayName =
      targetMember?.user?.tag ||
      targetId;

    // ========================================================
    // REACTION UNBAN
    // ========================================================

    if (isUnban) {
      const result = db.prepare(`
        DELETE FROM reaction_bans
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
              'Reaction Unban',
              `**${displayName}** does not have an active reaction restriction.`
            ),
          ],
        });
      }

      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Reaction Restriction Removed',
            `**${displayName}** can add reactions again.`
          ),
        ],
      });
    }

    // The member must be in the server to apply the restriction.
    if (!targetMember) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Reaction Ban',
            'I could not find that member in this server. To apply a reaction restriction, specify a member who is currently in the server.'
          ),
        ],
      });
    }

    // ========================================================
    // CHECK THE BOT'S PERMISSIONS
    // ========================================================

    const botMember = message.guild.members.me;

    if (
      !botMember ||
      !botMember.permissions.has(
        PermissionFlagsBits.ManageMessages
      )
    ) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Missing Permission',
            'I need the Manage Messages permission to remove reactions from restricted members.'
          ),
        ],
      });
    }

    const getExistingBan = db.prepare(`
      SELECT user_id
      FROM reaction_bans
      WHERE guild_id = ? AND user_id = ?
    `);

    const existingBan = getExistingBan.get(
      message.guild.id,
      targetId
    );

    if (existingBan) {
      return message.reply({
        embeds: [
          buildEmbed(
            message,
            'Reaction Ban',
            `**${displayName}** already has an active reaction restriction.`
          ),
        ],
      });
    }

    // ========================================================
    // SAVE THE RESTRICTION
    // ========================================================

    db.prepare(`
      INSERT OR IGNORE INTO reaction_bans (
        guild_id,
        user_id,
        moderator_id
      )
      VALUES (?, ?, ?)
    `).run(
      message.guild.id,
      targetId,
      message.author.id
    );

    return message.reply({
      embeds: [
        buildEmbed(
          message,
          'Reaction Restriction Enabled',
          `**${displayName}** is now reaction-banned.\n\nThe bot will attempt to remove reactions they add. Other members' reactions will remain unaffected.\n\nUse \`${message.prefix || '$'}reactionunban ${targetId}\` to remove the restriction.`
        ),
      ],
    });
  },
};