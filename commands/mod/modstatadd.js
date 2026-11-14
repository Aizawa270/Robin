
const { EmbedBuilder } = require('discord.js');

let config = null;
try {
  config = require('../../config');
} catch {}

const VALID_ACTIONS = [
  'warn',
  'ban',
  'mute',
  'kick',
  'unban',
  'warnremove',
];

const MAX_AMOUNT = 1000;
const MANUAL_TARGET_ID = 'MANUAL-MODSTATS-ENTRY';

function getBotOwnerIds(client) {
  const ids = new Set();

  if (config?.ownerId) {
    ids.add(String(config.ownerId));
  }

  if (client?.ownerId) {
    ids.add(String(client.ownerId));
  }

  if (Array.isArray(client?.ownerIds)) {
    for (const id of client.ownerIds) {
      ids.add(String(id));
    }
  }

  if (process.env.OWNER_ID) {
    ids.add(String(process.env.OWNER_ID));
  }

  return ids;
}

function isBotOwner(client, userId) {
  return getBotOwnerIds(client).has(String(userId));
}

function isAdmin(member) {
  return !!member?.permissions?.has('Administrator');
}

function hasPermission(client, member) {
  return (
    isAdmin(member) ||
    member.id === member.guild.ownerId ||
    isBotOwner(client, member.id)
  );
}

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  return embed;
}

async function resolveTargetUserStrict(client, message, input) {
  if (!input) return null;

  const query = String(input).trim();
  if (!query) return null;

  // Mention or Discord ID.
  const id = query.replace(/[<@!>]/g, '');

  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);

    if (cached) return cached;

    return await client.users.fetch(id).catch(() => null);
  }

  // Exact username match.
  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(user =>
    user?.username?.toLowerCase() === lowered
  );

  if (cachedUser) return cachedUser;

  // Search this server's members.
  if (message.guild) {
    const cachedMember = message.guild.members.cache.find(member =>
      member?.user?.username?.toLowerCase() === lowered
    );

    if (cachedMember?.user) {
      return cachedMember.user;
    }

    const fetched = await message.guild.members.fetch().catch(() => null);

    if (fetched?.size) {
      const exact = fetched.find(member =>
        member?.user?.username?.toLowerCase() === lowered
      );

      if (exact?.user) {
        return exact.user;
      }
    }
  }

  return null;
}

module.exports = {
  name: 'modstatadd',
  description: 'Manually add moderation statistics to a moderator.',
  category: 'mod',
  usage: '$modstatadd <@user|userID|username> <stat> <amount>',
  aliases: ['addmodstats', 'addmodstat'],

  async execute(client, message, args) {
    if (!message.guild) return;

    // Same permission system as resetmodstats.
    if (!hasPermission(client, message.member)) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Permission Denied',
            'You do not have permission to use this command.'
          ),
        ],
      });
    }

    // Support both automodDB and modstatsDB.
    const db = client.automodDB || client.modstatsDB;

    if (!db) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Modstats Error',
            'Modstats database is not available. Please restart the bot.'
          ),
        ],
      });
    }

    const prefix = client.getPrefix?.(message.guild.id) || '$';

    // The last two arguments must be the action and amount.
    if (args.length < 3) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#3498db',
            'Modstat Add Usage',
            `**Usage:**\n` +
            `\`${prefix}modstatadd <@user|userID|username> <stat> <amount>\`\n\n` +
            `**Available stats:**\n` +
            `${VALID_ACTIONS.map(action => `\`${action}\``).join(', ')}\n\n` +
            `**Examples:**\n` +
            `\`${prefix}modstatadd @user warn 5\`\n` +
            `\`${prefix}modstatadd 123456789012345678 ban 10\`\n` +
            `\`${prefix}modstatadd username kick 3\``
          ),
        ],
      });
    }

    const targetQuery = args.slice(0, -2).join(' ').trim();
    const action = String(args[args.length - 2]).toLowerCase();
    const amountRaw = String(args[args.length - 1]).trim();

    if (!VALID_ACTIONS.includes(action)) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Invalid Stat',
            `Choose one of these actions:\n${VALID_ACTIONS.map(value => `\`${value}\``).join(', ')}`
          ),
        ],
      });
    }

    if (!/^\d+$/.test(amountRaw)) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Invalid Amount',
            'The amount must be a positive whole number.'
          ),
        ],
      });
    }

    const amount = Number(amountRaw);

    if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Invalid Amount',
            `Choose an amount between **1 and ${MAX_AMOUNT.toLocaleString()}**.`
          ),
        ],
      });
    }

    if (!targetQuery) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Missing User',
            'Please specify the moderator whose statistics you want to increase.'
          ),
        ],
      });
    }

    const targetUser = await resolveTargetUserStrict(
      client,
      message,
      targetQuery
    );

    if (!targetUser) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'User Not Found',
            'Could not find that user. Try a mention, ID, or exact username.'
          ),
        ],
      });
    }

    try {
      const timestamp = Date.now();
      const reason = `Manually added by ${message.author.tag} using modstatadd`;

      const insertStatement = db.prepare(`
        INSERT INTO modstats (
          guild_id,
          moderator_id,
          target_id,
          action_type,
          reason,
          duration,
          timestamp
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Insert every entry together in one transaction.
      const insertEntries = db.transaction(() => {
        for (let i = 0; i < amount; i++) {
          insertStatement.run(
            message.guild.id,
            targetUser.id,
            MANUAL_TARGET_ID,
            action,
            reason,
            null,
            timestamp
          );
        }
      });

      insertEntries.immediate();

      const statName =
        action.charAt(0).toUpperCase() + action.slice(1);

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('Modstats Updated')
        .setDescription(
          `Successfully added **${amount.toLocaleString()} ${statName}** action(s) to **${targetUser.tag || targetUser.username}**.`
        )
        .setThumbnail(
          targetUser.displayAvatarURL({ size: 256 })
        )
        .addFields(
          {
            name: 'Moderator',
            value: `${targetUser}`,
            inline: true,
          },
          {
            name: 'Statistic',
            value: statName,
            inline: true,
          },
          {
            name: 'Amount Added',
            value: amount.toLocaleString(),
            inline: true,
          },
          {
            name: 'Added By',
            value: message.author.tag,
            inline: true,
          }
        )
        .setTimestamp();

      return message.reply({
        embeds: [embed],
        allowedMentions: { users: [] },
      });

    } catch (error) {
      console.error('[ModstatAdd] Error:', error);

      return message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Modstat Add Failed',
            'Failed to add moderation statistics. No partial entries should have been saved.'
          ),
        ],
      });
    }
  },
};
