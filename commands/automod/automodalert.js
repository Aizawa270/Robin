const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const COLORS = {
  primary: '#5865F2',
  success: '#3BA55D',
  danger: '#ED4245',
};

// ============================================================
// EMBED HELPERS
// ============================================================

function makeEmbed(title, description, color = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: 'Automod • Configuration',
    })
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function getPrefix(client, guildId) {
  return client.getPrefix
    ? client.getPrefix(guildId)
    : '$';
}

function getTargetLabel(row) {
  return row.target_type === 'role'
    ? `<@&${row.target_id}>`
    : `<@${row.target_id}>`;
}

// ============================================================
// WHITELIST LIST EMBED
// ============================================================

function buildListEmbed(title, rows, scope) {
  const embed = makeEmbed(
    title,
    `**Scope:** ${scope}`
  );

  if (!rows.length) {
    embed.setDescription(
      `**Scope:** ${scope}\n\nNo whitelist entries are configured here.`
    );

    return embed;
  }

  const users = rows
    .filter(row => row.target_type === 'user')
    .map(getTargetLabel);

  const roles = rows
    .filter(row => row.target_type === 'role')
    .map(getTargetLabel);

  embed.addFields(
    {
      name: `Users (${users.length})`,
      value: users.length
        ? users.join('\n').slice(0, 1024)
        : 'None',
      inline: true,
    },
    {
      name: `Roles (${roles.length})`,
      value: roles.length
        ? roles.join('\n').slice(0, 1024)
        : 'None',
      inline: true,
    }
  );

  embed.setFooter({
    text: `${rows.length} whitelist entries`,
  });

  return embed;
}

// ============================================================
// TARGET RESOLUTION
// ============================================================

async function resolveTarget(message, token) {
  if (!token) return null;

  const roleMention = token.match(/^<@&(\d+)>$/);
  const userMention = token.match(/^<@!?(\d+)>$/);
  const rawId = token.match(/^(\d{15,22})$/);

  const roleId = roleMention?.[1] || null;
  const userId = userMention?.[1] || rawId?.[1] || null;

  // Role mention.
  if (roleId) {
    const role =
      message.guild.roles.cache.get(roleId) ||
      await message.guild.roles.fetch(roleId).catch(() => null);

    if (!role) return null;

    return {
      type: 'role',
      id: role.id,
      label: role.name,
    };
  }

  if (!userId) return null;

  // A raw ID might refer to a role.
  if (!userMention && !roleMention) {
    const role =
      message.guild.roles.cache.get(userId) ||
      await message.guild.roles.fetch(userId).catch(() => null);

    if (role) {
      return {
        type: 'role',
        id: role.id,
        label: role.name,
      };
    }
  }

  // User mention or ID.
  const member = await message.guild.members
    .fetch(userId)
    .catch(() => null);

  if (!member) return null;

  return {
    type: 'user',
    id: member.id,
    label: member.user.tag,
  };
}

// ============================================================
// CHANNEL RESOLUTION
// ============================================================

async function resolveChannel(message, token) {
  const mention = String(token || '').match(/^<#(\d+)>$/);
  const rawId = String(token || '').match(/^(\d{15,22})$/);

  const channelId = mention?.[1] || rawId?.[1];

  if (!channelId) return null;

  const channel = await message.guild.channels
    .fetch(channelId)
    .catch(() => null);

  if (!channel?.isTextBased()) return null;

  return channel;
}

// ============================================================
// SUCCESS / REMOVAL EMBEDS
// ============================================================

function targetAddedEmbed(target, scope) {
  const mention = target.type === 'role'
    ? `<@&${target.id}>`
    : `<@${target.id}>`;

  return makeEmbed(
    'Whitelist entry added',
    [
      `**Target:** ${mention}`,
      `**Type:** ${target.type === 'role' ? 'Role' : 'User'}`,
      `**Scope:** ${scope}`,
      '',
      'Automod will ignore this target within the selected scope.',
    ].join('\n'),
    COLORS.success
  ).addFields({
    name: 'Target ID',
    value: `\`${target.id}\``,
    inline: true,
  });
}

function targetRemovedEmbed(target, scope) {
  const mention = target.type === 'role'
    ? `<@&${target.id}>`
    : `<@${target.id}>`;

  return makeEmbed(
    'Whitelist entry removed',
    [
      `**Target:** ${mention}`,
      `**Scope:** ${scope}`,
      '',
      'This target is subject to automod again within this scope.',
    ].join('\n'),
    COLORS.danger
  ).addFields({
    name: 'Target ID',
    value: `\`${target.id}\``,
    inline: true,
  });
}

// ============================================================
// SERVER-WIDE WHITELIST
// ============================================================

async function handleGlobalWhitelist(
  client,
  message,
  args,
  action
) {
  const guildId = message.guild.id;
  const prefix = getPrefix(client, guildId);

  let mode = action;
  let targetToken = args[1];

  // aal whitelist list
  if (
    mode === 'whitelist' &&
    args[1]?.toLowerCase() === 'list'
  ) {
    const rows = client.automod.listGlobalWhitelist(guildId);

    return message.reply({
      embeds: [
        buildListEmbed(
          'Server-wide whitelist',
          rows,
          'Entire server'
        ),
      ],
    });
  }

  // aal whitelist remove @user
  if (
    mode === 'whitelist' &&
    args[1]?.toLowerCase() === 'remove'
  ) {
    mode = 'unwhitelist';
    targetToken = args[2];
  }

  if (!targetToken) {
    return message.reply({
      embeds: [
        makeEmbed(
          'Server-wide whitelist',
          [
            `**Add:** \`${prefix}aal whitelist @user/@role\``,
            `**Remove:** \`${prefix}aal unwhitelist @user/@role\``,
            `**List:** \`${prefix}aal whitelist list\``,
          ].join('\n')
        ),
      ],
    });
  }

  const target = await resolveTarget(message, targetToken);

  if (!target) {
    return message.reply(
      'Please mention a server member or role, or provide a valid ID.'
    );
  }

  if (mode === 'whitelist') {
    const success = client.automod.addGlobalWhitelist(
      guildId,
      target.type,
      target.id
    );

    if (!success) {
      return message.reply('Failed to save the whitelist entry.');
    }

    return message.reply({
      embeds: [
        targetAddedEmbed(target, 'Entire server'),
      ],
    });
  }

  const success = client.automod.removeGlobalWhitelist(
    guildId,
    target.type,
    target.id
  );

  if (!success) {
    return message.reply(
      'That target was not in the server-wide whitelist.'
    );
  }

  return message.reply({
    embeds: [
      targetRemovedEmbed(target, 'Entire server'),
    ],
  });
}

// ============================================================
// CHANNEL-SPECIFIC WHITELIST
// ============================================================

async function handleChannelWhitelist(
  client,
  message,
  args,
  channel
) {
  const guildId = message.guild.id;
  const prefix = getPrefix(client, guildId);

  let mode = String(args[1] || '').toLowerCase();
  let targetToken = args[2];

  if (!['whitelist', 'unwhitelist'].includes(mode)) {
    return message.reply({
      embeds: [
        makeEmbed(
          'Channel-specific whitelist',
          [
            `**Add:** \`${prefix}aal #channel whitelist @user/@role\``,
            `**Remove:** \`${prefix}aal #channel unwhitelist @user/@role\``,
            `**List:** \`${prefix}aal #channel whitelist list\``,
          ].join('\n')
        ),
      ],
    });
  }

  // aal #channel whitelist list
  if (
    mode === 'whitelist' &&
    args[2]?.toLowerCase() === 'list'
  ) {
    const rows = client.automod.listChannelWhitelist(
      guildId,
      channel.id
    );

    return message.reply({
      embeds: [
        buildListEmbed(
          'Channel-specific whitelist',
          rows,
          `${channel}`
        ),
      ],
    });
  }

  // aal #channel whitelist remove @user
  if (
    mode === 'whitelist' &&
    args[2]?.toLowerCase() === 'remove'
  ) {
    mode = 'unwhitelist';
    targetToken = args[3];
  }

  if (!targetToken) {
    return message.reply({
      embeds: [
        makeEmbed(
          'Channel-specific whitelist',
          [
            `**Channel:** ${channel}`,
            `**Add:** \`${prefix}aal ${channel} whitelist @user/@role\``,
            `**Remove:** \`${prefix}aal ${channel} unwhitelist @user/@role\``,
            `**List:** \`${prefix}aal ${channel} whitelist list\``,
          ].join('\n')
        ),
      ],
    });
  }

  const target = await resolveTarget(message, targetToken);

  if (!target) {
    return message.reply(
      'Please mention a server member or role, or provide a valid ID.'
    );
  }

  if (mode === 'whitelist') {
    const success = client.automod.addChannelWhitelist(
      guildId,
      channel.id,
      target.type,
      target.id
    );

    if (!success) {
      return message.reply(
        'Failed to save the channel whitelist entry.'
      );
    }

    return message.reply({
      embeds: [
        targetAddedEmbed(target, `Channel ${channel}`),
      ],
    });
  }

  const success = client.automod.removeChannelWhitelist(
    guildId,
    channel.id,
    target.type,
    target.id
  );

  if (!success) {
    return message.reply(
      'That target was not whitelisted in this channel.'
    );
  }

  return message.reply({
    embeds: [
      targetRemovedEmbed(target, `Channel ${channel}`),
    ],
  });
}

// ============================================================
// EXISTING ALERT TARGET MANAGEMENT
// ============================================================

async function handleAlertTargets(
  client,
  message,
  args,
  sub
) {
  const guildId = message.guild.id;
  const prefix = getPrefix(client, guildId);

  // aal list
  if (sub === 'list') {
    const rows = client.automod.listAlertTargets(guildId);

    const users = rows
      .filter(row => row.target_type === 'user')
      .map(getTargetLabel);

    const roles = rows
      .filter(row => row.target_type === 'role')
      .map(getTargetLabel);

    const embed = makeEmbed(
      'Automod alert mentions',
      'These users and roles are mentioned when an automod alert is created.'
    );

    if (!rows.length) {
      embed.setDescription('No alert targets are configured.');
    } else {
      embed.addFields(
        {
          name: `Users (${users.length})`,
          value: users.length
            ? users.join('\n').slice(0, 1024)
            : 'None',
          inline: true,
        },
        {
          name: `Roles (${roles.length})`,
          value: roles.length
            ? roles.join('\n').slice(0, 1024)
            : 'None',
          inline: true,
        }
      );
    }

    return message.reply({
      embeds: [embed],
    });
  }

  const target = await resolveTarget(message, args[1]);

  if (!target) {
    return message.reply({
      embeds: [
        makeEmbed(
          'Automod alert mentions',
          [
            `**Add:** \`${prefix}aal add @user/@role\``,
            `**Remove:** \`${prefix}aal remove @user/@role\``,
            `**List:** \`${prefix}aal list\``,
          ].join('\n')
        ),
      ],
    });
  }

  const mention = target.type === 'role'
    ? `<@&${target.id}>`
    : `<@${target.id}>`;

  if (sub === 'add') {
    const success = client.automod.addAlertTarget(
      guildId,
      target.type,
      target.id
    );

    if (!success) {
      return message.reply('Failed to save the alert target.');
    }

    return message.reply({
      embeds: [
        makeEmbed(
          'Alert target added',
          `${mention} will now be mentioned in automod alerts.`,
          COLORS.success
        ),
      ],
    });
  }

  if (sub === 'remove') {
    const success = client.automod.removeAlertTarget(
      guildId,
      target.type,
      target.id
    );

    if (!success) {
      return message.reply(
        'That user or role was not in the alert list.'
      );
    }

    return message.reply({
      embeds: [
        makeEmbed(
          'Alert target removed',
          `${mention} will no longer be mentioned in automod alerts.`,
          COLORS.danger
        ),
      ],
    });
  }
}

// ============================================================
// COMMAND EXPORT
// ============================================================

module.exports = {
  name: 'automodalert',
  aliases: ['aal'],
  description: 'Manage automod alerts and whitelist entries.',
  category: 'automod',
  hidden: true,
  usage: '$aal',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !message.member?.permissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return message.reply(
        'You need the **Administrator** permission to manage automod.'
      );
    }

    if (!client.automod) {
      return message.reply(
        'Automod is not initialized. Please restart the bot.'
      );
    }

    const tokens = [...args];
    const first = String(tokens[0] || '').toLowerCase();
    const prefix = getPrefix(client, message.guild.id);

    if (!first) {
      return message.reply({
        embeds: [
          makeEmbed(
            'Automod configuration',
            [
              '**Server-wide whitelist**',
              `\`${prefix}aal whitelist @user/@role\``,
              `\`${prefix}aal unwhitelist @user/@role\``,
              `\`${prefix}aal whitelist list\``,
              '',
              '**Channel-specific whitelist**',
              `\`${prefix}aal #channel whitelist @user/@role\``,
              `\`${prefix}aal #channel unwhitelist @user/@role\``,
              `\`${prefix}aal #channel whitelist list\``,
              '',
              '**Alert mentions**',
              `\`${prefix}aal add @user/@role\``,
              `\`${prefix}aal remove @user/@role\``,
              `\`${prefix}aal list\``,
            ].join('\n')
          ),
        ],
      });
    }

    // Channel-specific whitelist.
    const channel = await resolveChannel(message, tokens[0]);

    if (channel) {
      return handleChannelWhitelist(
        client,
        message,
        tokens,
        channel
      );
    }

    // Server-wide whitelist.
    if (
      first === 'whitelist' ||
      first === 'unwhitelist'
    ) {
      return handleGlobalWhitelist(
        client,
        message,
        tokens,
        first
      );
    }

    // Existing alert target commands.
    if (['add', 'remove', 'list'].includes(first)) {
      return handleAlertTargets(
        client,
        message,
        tokens,
        first
      );
    }

    return message.reply({
      embeds: [
        makeEmbed(
          'Unknown automod option',
          `Use \`${prefix}aal\` to see the available options.`,
          COLORS.danger
        ),
      ],
    });
  },
};