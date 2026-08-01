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

function buildUsage(prefix) {
  return makeEmbed(
    '#f43f5e',
    'Ban Command Usage',
    `**Usage:** \`${prefix}ban <@user|userID|username|display name> [reason]\`\n\n**Examples:**\n${prefix}ban @User spamming\n${prefix}ban 123456789012345678 breaking rules\n${prefix}ban xusion being annoying`
  );
}

async function resolveTargetUser(message, input) {
  if (!input) return null;

  if (typeof message.resolveUser === 'function') {
    return await message.resolveUser(input);
  }

  const raw = String(input).trim();
  if (!raw) return null;

  const mentionMatch = raw.match(/^<@!?(\d{15,20})>$/);
  const id = mentionMatch?.[1] || raw.replace(/[<@!>]/g, '');

  if (/^\d{15,20}$/.test(id)) {
    const cached = message.client.users.cache.get(id);
    if (cached) return cached;
    return await message.client.users.fetch(id).catch(() => null);
  }

  const lowered = raw.toLowerCase();

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

    const fetchedMembers = await message.guild.members.fetch({
      query: raw,
      limit: 10
    }).catch(() => null);

    if (fetchedMembers?.size) {
      const exact = fetchedMembers.find(m =>
        m?.displayName?.toLowerCase() === lowered ||
        m?.user?.username?.toLowerCase() === lowered ||
        m?.user?.globalName?.toLowerCase() === lowered
      );

      return exact?.user || fetchedMembers.first()?.user || null;
    }
  }

  return null;
}

async function resolveTargetMember(message, input) {
  if (!message.guild) return null;

  if (typeof message.resolveMember === 'function') {
    return await message.resolveMember(input);
  }

  const user = await resolveTargetUser(message, input);
  if (!user) return null;

  return (
    message.guild.members.cache.get(user.id) ||
    await message.guild.members.fetch(user.id).catch(() => null)
  );
}

module.exports = {
  name: 'ban',
  aliases: ['B', 'b'],
  description: 'Ban a user by mention, ID, username, or display name.',
  category: 'mod',
  usage: '$ban <@user|userID|username|display name> [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Ban Failed', 'This command can only be used in a server.')]
      });
    }

    if (!message.member?.permissions?.has(PermissionFlagsBits.BanMembers)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Ban Failed', 'You need **Ban Members** permission.')]
      });
    }

    const prefix = message.prefix || client.getPrefix?.(message.guild.id) || '$';

    if (!args.length) {
      return message.reply({ embeds: [buildUsage(prefix)] });
    }

    if (message.mentions.users.size > 1) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Ban Failed', `Use **one target only**.\nCorrect format: \`${prefix}ban @user reason\``)]
      });
    }

    const targetInput = args[0];
    const reason = args.slice(1).join(' ').trim() || 'No reason provided';

    const targetUser = await resolveTargetUser(message, targetInput);
    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Ban Failed', 'User not found. Try a mention, user ID, exact username, or display name.')]
      });
    }

    if (targetUser.id === message.author.id) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Ban Failed', 'You cannot ban yourself.')] });
    }

    if (targetUser.id === client.user.id) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Ban Failed', 'I cannot ban myself.')] });
    }

    const targetMember = await resolveTargetMember(message, targetInput);
    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    if (targetMember && isOwner(message.guild, targetMember) && !isOwner(message.guild, message.member)) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Ban Failed', 'You cannot ban the server owner.')] });
    }

    if (targetMember && !isOwner(message.guild, message.member)) {
      if (getRolePos(targetMember) >= getRolePos(message.member)) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Ban Failed', 'You cannot ban someone with equal or higher role.')]
        });
      }
    }

    if (targetMember && botMember && getRolePos(targetMember) >= getRolePos(botMember)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Ban Failed', 'I cannot ban that user because my role is too low.')]
      });
    }

    if (targetMember && !targetMember.bannable) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Ban Failed', 'I cannot ban that user.')] });
    }

    const existingBan = await message.guild.bans.fetch(targetUser.id).catch(() => null);
    if (existingBan) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Already Banned', `<@${targetUser.id}> is already banned from this server.`)]
      });
    }

    try {
      await message.guild.bans.create(targetUser.id, {
        reason: `${reason} (banned by ${message.author.tag})`,
      });

      logModAction(client, message.guild.id, message.author.id, targetUser.id, 'ban', reason);

      const embed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('User Banned')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: false },
          { name: 'Banned by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Ban command error:', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Failed to Ban User', 'There was an error trying to ban the user.')]
      });
    }
  },
};