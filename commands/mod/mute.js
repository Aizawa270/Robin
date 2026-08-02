const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

function getRolePos(member) {
  return member?.roles?.highest?.position ?? 0;
}

function isOwner(guild, member) {
  return !!guild?.ownerId && member?.id === guild.ownerId;
}

function parseDuration(str) {
  if (!str) return null;

  const regex = /(\d+)\s*(s|m|h|d)/gi;
  let match;
  let totalMs = 0;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

  while ((match = regex.exec(str)) !== null) {
    const v = Number(match[1]);
    const unit = match[2].toLowerCase();
    totalMs += v * (multipliers[unit] || 0);
  }

  const max = 28 * 24 * 60 * 60 * 1000;
  if (!totalMs || totalMs > max) return null;
  return totalMs;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days) return `${days} day${days !== 1 ? 's' : ''}`;
  if (hours) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  if (minutes) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

async function resolveTargetUserStrict(client, message, raw) {
  if (!raw) return null;

  const query = String(raw).trim();
  if (!query) return null;

  const id = query.replace(/[<@!>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    const cached = client.users.cache.get(id);
    if (cached) return cached;
    return await client.users.fetch(id).catch(() => null);
  }

  const lowered = query.toLowerCase();

  const cachedUser = client.users.cache.find(u =>
    u?.username?.toLowerCase() === lowered
  );
  if (cachedUser) return cachedUser;

  if (message.guild) {
    const cachedMember = message.guild.members.cache.find(m =>
      m?.user?.username?.toLowerCase() === lowered
    );
    if (cachedMember?.user) return cachedMember.user;

    const fetchedMembers = await message.guild.members.fetch().catch(() => null);
    if (fetchedMembers?.size) {
      const exact = fetchedMembers.find(m =>
        m?.user?.username?.toLowerCase() === lowered
      );
      if (exact?.user) return exact.user;
    }
  }

  return null;
}

module.exports = {
  name: 'mute',
  description: 'Timeout a user for a duration.',
  category: 'mod',
  usage: '$mute <@user|userID|username> <duration> [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'Server only.')]
      });
    }

    const perms = message.member?.permissions;
    if (!perms?.has(PermissionFlagsBits.ModerateMembers) && !perms?.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'You need **Timeout Members** permission.')]
      });
    }

    const prefix = message.prefix || client.getPrefix?.(message.guild.id) || '$';

    if (!args.length) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#facc15',
            'Mute Command Usage',
            `**Usage:** \`${prefix}mute <@user|userID|username> <duration> [reason]\`\n\n**Examples:**\n${prefix}mute @User 10m spamming\n${prefix}mute 123456789012345678 1h advertising\n${prefix}mute xusion 30m being annoying`
          ),
        ],
      });
    }

    const targetToken = args.shift();
    const targetUser = await resolveTargetUserStrict(client, message, targetToken);

    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Mute Failed', 'User not found. Try a mention, user ID, or exact username.')]
      });
    }

    const durationArg = args.shift();
    if (!durationArg) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Mute Failed', 'Provide a duration like `10m`, `1h30m`, or `2d`.')]
      });
    }

    const durationMs = parseDuration(durationArg);
    if (!durationMs) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Mute Failed', 'Invalid duration format. Examples: `10m`, `1h30m`, `2d`.')]
      });
    }

    const reason = args.join(' ').trim() || 'No reason provided';
    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    if (!member) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Mute Failed', 'User not in this server.')]
      });
    }

    if (member.id === message.author.id) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'You cannot mute yourself.')]
      });
    }

    if (member.id === client.user.id) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'I cannot mute myself.')]
      });
    }

    if (isOwner(message.guild, member) && !isOwner(message.guild, message.member)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'You cannot mute the server owner.')]
      });
    }

    if (!isOwner(message.guild, message.member)) {
      if (getRolePos(member) >= getRolePos(message.member)) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Mute Failed', 'You cannot mute someone with equal or higher role.')]
        });
      }
    }

    if (botMember && getRolePos(member) >= getRolePos(botMember)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'I cannot mute that user because my role is too low.')]
      });
    }

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'Cannot mute an administrator.')]
      });
    }

    if (!botMember?.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'I need **Timeout Members** permission to mute users.')]
      });
    }

    if (!member.moderatable) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'I cannot mute this user (insufficient permissions or role hierarchy).')]
      });
    }

    if (member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now()) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#facc15')
            .setTitle('User Already Muted')
            .setDescription(`<@${member.id}> is already muted.`)
            .addFields({
              name: 'Mute ends',
              value: `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`,
            })
            .setTimestamp(),
        ],
      });
    }

    try {
      await member.timeout(durationMs, `${reason} (muted by ${message.author.tag})`);

      try {
        logModAction(client, message.guild.id, message.author.id, targetUser.id, 'mute', reason, durationArg);
      } catch (err) {
        console.error('[Mute] logModAction failed:', err);
      }

      const endsAt = new Date(Date.now() + durationMs);
      const embed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('User Muted')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: false },
          { name: 'Muted by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Duration', value: `${durationArg} (${formatDuration(durationMs)})`, inline: false },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Mute ends', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: false }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Mute error:', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Mute Failed', 'Failed to mute the user.')]
      });
    }
  },
};