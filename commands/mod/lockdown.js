const { EmbedBuilder } = require('discord.js');
const { ownerId } = require('../../config');

const LOCK_PERMS = {
  SendMessages: false,
  AddReactions: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  SendMessagesInThreads: false,
};

const UNLOCK_PERMS = {
  SendMessages: null,
  AddReactions: null,
  CreatePublicThreads: null,
  CreatePrivateThreads: null,
  SendMessagesInThreads: null,
};

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

function isOwnerOrServerOwner(message) {
  return message.author.id === ownerId || message.author.id === message.guild?.ownerId;
}

function parseDuration(input) {
  if (!input) return null;
  const match = String(input).trim().match(/^(\d+)(s|m|h)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit === 's') return value * 1000;
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  return null;
}

function resolveChannel(message, raw) {
  if (!raw) return null;

  const query = String(raw).trim();
  if (!query) return null;

  const mention = message.mentions.channels.first();
  if (mention && query.includes(mention.id)) return mention;

  const id = query.replace(/[<#>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    return message.guild.channels.cache.get(id) || null;
  }

  return null;
}

async function resolveTargetUser(message, raw) {
  if (!raw) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(raw);
  }

  const query = String(raw).trim();
  if (!query) return null;

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = message.client.users.cache.get(id);
    if (cached) return cached;
    return await message.client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = message.client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered ||
    u?.globalName?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    const member = message.guild.members.cache.find(m =>
      m?.displayName?.toLowerCase() === lowered ||
      m?.user?.username?.toLowerCase() === lowered ||
      m?.user?.globalName?.toLowerCase() === lowered
    );
    if (member?.user) return member.user;
  }

  return null;
}

async function setLockdown(channel, everyoneRole, locked) {
  if (!channel?.permissionOverwrites?.edit) return false;

  await channel.permissionOverwrites.edit(
    everyoneRole,
    locked ? LOCK_PERMS : UNLOCK_PERMS
  );

  return true;
}

module.exports = {
  name: 'lockdown',
  description: 'Lock a channel so only admins can speak',
  category: 'mod',
  usage: '!lockdown #channel [duration] | !lockdown access <@user|id|username> [#channel]',
  aliases: [],

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Lockdown Failed', 'This command can only be used in a server.')]
      });
    }

    if (!isOwnerOrServerOwner(message)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Lockdown Failed', 'You do not have permission to use this command.')]
      });
    }

    const sub = args[0]?.toLowerCase();

    // ============================================================
    // SUBCOMMAND: ACCESS TOGGLE
    // Usage: !lockdown access @user [#channel]
    // ============================================================
    if (sub === 'access') {
      const targetArg = args[1];
      const channelArg = args[2];
      const channel = channelArg ? resolveChannel(message, channelArg) : message.channel;

      if (!targetArg) {
        return message.reply({
          embeds: [makeEmbed('#f59e0b', 'Lockdown Access Usage', `\`${message.prefix || '!'}lockdown access <@user|id|username> [#channel]\``)]
        });
      }

      if (!channel || !channel.permissionOverwrites?.edit || !channel.guild) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Invalid Channel', 'Please provide a valid text channel or channel ID.')]
        });
      }

      const targetUser = await resolveTargetUser(message, targetArg);
      if (!targetUser) {
        return message.reply({
          embeds: [makeEmbed('#f59e0b', 'User Not Found', 'Could not find that user. Try a mention, ID, username, or display name.')]
        });
      }

      const existing = channel.permissionOverwrites.cache.get(targetUser.id);
      const currentlyHasAccess =
        existing?.allow?.has('SendMessages') ||
        existing?.allow?.has('SendMessagesInThreads');

      const nextPerms = currentlyHasAccess
        ? {
            SendMessages: null,
            SendMessagesInThreads: null,
            AddReactions: null,
            CreatePublicThreads: null,
            CreatePrivateThreads: null,
          }
        : {
            SendMessages: true,
            SendMessagesInThreads: true,
          };

      try {
        await channel.permissionOverwrites.edit(targetUser.id, nextPerms);

        const embed = makeEmbed(
          currentlyHasAccess ? '#f59e0b' : '#10b981',
          currentlyHasAccess ? 'Access Removed' : 'Access Granted',
          currentlyHasAccess
            ? `Removed lockdown access for <@${targetUser.id}> in ${channel}.`
            : `Granted lockdown access to <@${targetUser.id}> in ${channel}.`
        );

        return message.reply({ embeds: [embed] });
      } catch (err) {
        console.error('[Lockdown Access] Error:', err);
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Lockdown Access Failed', 'There was an error updating that user’s channel access.')]
        });
      }
    }

    // ============================================================
    // NORMAL LOCKDOWN
    // Usage: !lockdown #channel [duration]
    // ============================================================
    const channelArg = args[0];
    const durationArg = args[1];

    if (!channelArg) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Lockdown Usage',
            `Use \`${message.prefix || '!'}lockdown #channel/channel_id [duration]\`\n\nExample:\n\`${message.prefix || '!'}lockdown #general 10m\``
          )
        ]
      });
    }

    const channel = resolveChannel(message, channelArg);

    if (!channel || !channel.permissionOverwrites?.edit || !channel.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Invalid Channel', 'Please provide a valid text channel or channel ID.')]
      });
    }

    const duration = parseDuration(durationArg);

    try {
      await setLockdown(channel, message.guild.roles.everyone, true);

      await message.reply({
        embeds: [
          makeEmbed(
            '#ef4444',
            'Channel Locked',
            `🔒 ${channel} is now locked.${duration ? ` It will unlock automatically in **${durationArg}**.` : ''}`
          )
        ]
      });

      if (duration) {
        setTimeout(async () => {
          try {
            await setLockdown(channel, message.guild.roles.everyone, false);
            await channel.send({
              embeds: [
                makeEmbed('#10b981', 'Lockdown Lifted', `🔓 ${channel} has been unlocked.`)
              ]
            }).catch(() => {});
          } catch (err) {
            console.error('[Lockdown] Auto-unlock failed:', err);
          }
        }, duration);
      }
    } catch (err) {
      console.error('[Lockdown] Error:', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Lockdown Failed', 'There was an error locking that channel.')]
      });
    }
  },
};