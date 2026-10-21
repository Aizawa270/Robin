const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  logModAction,
} = require('../../handlers/modstatsHelper');

const {
  resolveUser,
  resolveMember,
} = require('../../handlers/universalHelper');

// ============================================================
// PREFIX HELPERS
// ============================================================

function getPrefixCandidates(client, message) {
  const prefixes = [];

  function addPrefix(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        addPrefix(item);
      }

      return;
    }

    if (typeof value === 'string' && value.length > 0) {
      prefixes.push(value);
    }
  }

  addPrefix(message.prefix);

  try {
    if (typeof client.getPrefix === 'function') {
      addPrefix(client.getPrefix(message.guild?.id));
    }
  } catch (error) {
    console.error('[Warn] Could not retrieve server prefix:', error);
  }

  addPrefix(client.prefix);
  addPrefix(client.config?.prefix);

  const uniquePrefixes = [...new Set(prefixes)];

  if (uniquePrefixes.length === 0) {
    uniquePrefixes.push('$');
  }

  return uniquePrefixes;
}

// ============================================================
// EXACT COMMAND CHECK
// ============================================================

function isExactWarnCommand(client, message) {
  const content = String(message.content || '').trim();

  if (!content) {
    return false;
  }

  const tokens = content.split(/\s+/);
  const firstToken = tokens[0].toLowerCase();

  // Support direct bot-mention invocation, if the dispatcher
  // accepts it.
  if (
    /^<@!?\d+>$/.test(firstToken) &&
    String(tokens[1] || '').toLowerCase() === 'warn'
  ) {
    return true;
  }

  const prefixes = getPrefixCandidates(client, message);

  return prefixes.some(prefix => {
    const invokedName = firstToken
      .startsWith(prefix.toLowerCase())
      ? firstToken.slice(prefix.length).toLowerCase()
      : '';

    // Exact name only. No "w" alias and no substring matching.
    return invokedName === 'warn';
  });
}

// ============================================================
// EMBEDS
// ============================================================

function makeEmbed(
  color,
  title,
  description
) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  return embed;
}

// ============================================================
// ROLE HELPERS
// ============================================================

function getRolePos(member) {
  return member?.roles?.highest?.position ?? 0;
}

function isOwner(guild, member) {
  return guild?.ownerId === member?.id;
}

// ============================================================
// WARNING COUNT
// ============================================================

function getWarnCount(
  client,
  guildId,
  userId
) {
  try {
    if (!client.automodDB) {
      return 0;
    }

    const row = client.automodDB.prepare(`
      SELECT COUNT(*) AS count
      FROM automod_warns
      WHERE guild_id = ?
        AND user_id = ?
    `).get(
      String(guildId),
      String(userId)
    );

    return row?.count || 0;
  } catch (error) {
    console.error('[Warn Count] error:', error);
    return 0;
  }
}

// ============================================================
// COMMAND
// ============================================================

module.exports = {
  name: 'warn',

  // No aliases property. "w" is deliberately not supported.
  description: 'Warn a user.',

  category: 'mod',

  usage: '$warn <@user|ID|username> <reason>',

  async execute(client, message, args) {
    // Do not silently reject a valid command just because one
    // prefix source disagrees with another.
    if (!message.guild || !isExactWarnCommand(client, message)) {
      return;
    }

    if (!message.member) {
      return;
    }

    const prefix = getPrefixCandidates(client, message)[0];

    // --------------------------------------------------------
    // PERMISSIONS
    // --------------------------------------------------------

    if (
      !message.member.permissions.has(
        PermissionFlagsBits.ModerateMembers
      ) &&
      !message.member.permissions.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Warn Failed',
            'You need **Moderate Members** permission.'
          ),
        ],
      });
    }

    // --------------------------------------------------------
    // USAGE
    // --------------------------------------------------------

    if (!args.length) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#facc15',
            'Warn Usage',
            `**Usage:**\n` +
            `\`${prefix}warn <@user|ID|username> <reason>\`\n\n` +
            `**Examples:**\n` +
            `\`${prefix}warn @User spam\`\n` +
            `\`${prefix}warn 123456789012345678 spam\`\n` +
            `\`${prefix}warn username spam\``
          ),
        ],
      });
    }

    // --------------------------------------------------------
    // RESOLVE TARGET
    // --------------------------------------------------------

    const targetInput = args[0];

    const reason = args
      .slice(1)
      .join(' ')
      .trim() || 'No reason provided';

    const targetUser = await resolveUser(
      client,
      message,
      targetInput
    );

    if (!targetUser) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Warn Failed',
            'User not found. Use a mention, ID, or username.'
          ),
        ],
      });
    }

    if (targetUser.id === message.author.id) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Warn Failed',
            'You cannot warn yourself.'
          ),
        ],
      });
    }

    if (targetUser.id === client.user.id) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Warn Failed',
            'You cannot warn the bot.'
          ),
        ],
      });
    }

    const member = await resolveMember(
      client,
      message,
      targetInput
    );

    if (!member) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Warn Failed',
            'User is not in this server.'
          ),
        ],
      });
    }

    // --------------------------------------------------------
    // ROLE AND PERMISSION CHECKS
    // --------------------------------------------------------

    const botMember =
      message.guild.members.me ||
      await message.guild.members
        .fetchMe()
        .catch(() => null);

    if (
      isOwner(message.guild, member) &&
      !isOwner(message.guild, message.member)
    ) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Warn Failed',
            'You cannot warn the server owner.'
          ),
        ],
      });
    }

    if (!isOwner(message.guild, message.member)) {
      if (
        getRolePos(member) >=
        getRolePos(message.member)
      ) {
        return message.reply({
          embeds: [
            makeEmbed(
              '#ef4444',
              'Warn Failed',
              'You cannot warn someone with an equal or higher role.'
            ),
          ],
        });
      }
    }

    if (
      botMember &&
      getRolePos(member) >= getRolePos(botMember)
    ) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Warn Failed',
            'I cannot warn this user because my role is too low.'
          ),
        ],
      });
    }

    if (
      member.permissions.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Warn Failed',
            'Cannot warn an administrator.'
          ),
        ],
      });
    }

    // --------------------------------------------------------
    // DATABASE CHECK
    // --------------------------------------------------------

    if (!client.automodDB) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Warn Failed',
            'Warning database unavailable.'
          ),
        ],
      });
    }

    // --------------------------------------------------------
    // SAVE WARNING
    // --------------------------------------------------------

    try {
      client.automodDB.prepare(`
        INSERT INTO automod_warns
        (
          guild_id,
          user_id,
          moderator_id,
          reason,
          timestamp
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(
        message.guild.id,
        targetUser.id,
        message.author.id,
        reason,
        Date.now()
      );

      const warnCount = getWarnCount(
        client,
        message.guild.id,
        targetUser.id
      );

      client.automodDB.prepare(`
        INSERT OR REPLACE INTO automod_warn_counts
        (
          guild_id,
          user_id,
          count
        )
        VALUES (?, ?, ?)
      `).run(
        message.guild.id,
        targetUser.id,
        warnCount
      );

      logModAction(
        client,
        message.guild.id,
        message.author.id,
        targetUser.id,
        'warn',
        reason
      );

      // ------------------------------------------------------
      // AUTOMATIC BAN AT FIVE WARNINGS
      // ------------------------------------------------------

      if (warnCount >= 5) {
        try {
          await member.ban({
            reason: 'Auto-ban: reached 5 warnings',
          });

          return message.reply({
            embeds: [
              makeEmbed(
                '#ef4444',
                'User Auto-Banned',
                `<@${targetUser.id}> reached **5/5 warnings** and was automatically banned.`
              ),
            ],
          });
        } catch (error) {
          console.error('[Warn Auto-Ban Error]', error);

          return message.reply({
            embeds: [
              makeEmbed(
                '#ef4444',
                'Warning Added',
                `<@${targetUser.id}> received warning **${warnCount}/5**, but the automatic ban failed. Check the bot's Ban Members permission and role hierarchy.`
              ),
            ],
          });
        }
      }

      // ------------------------------------------------------
      // SUCCESS EMBED
      // ------------------------------------------------------

      const embed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('User Warned')
        .setThumbnail(
          targetUser.displayAvatarURL({
            size: 1024,
          })
        )
        .addFields(
          {
            name: 'User',
            value: `<@${targetUser.id}>`,
            inline: false,
          },
          {
            name: 'Moderator',
            value: `<@${message.author.id}>`,
            inline: false,
          },
          {
            name: 'Reason',
            value: reason.slice(0, 1024),
            inline: false,
          },
          {
            name: 'Warnings',
            value: `${warnCount}/5`,
            inline: true,
          }
        )
        .setTimestamp();

      return message.reply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('[Warn Error]', error);

      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Warn Failed',
            'Failed to add warning.'
          ),
        ],
      });
    }
  },
};