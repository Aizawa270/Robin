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

async function resolveTargetMember(message, raw) {
  if (!message.guild) return null;

  if (typeof message.resolveMember === 'function') {
    return await message.resolveMember(raw);
  }

  const user = await resolveTargetUser(message, raw);
  if (!user) return null;

  return (
    message.guild.members.cache.get(user.id) ||
    await message.guild.members.fetch(user.id).catch(() => null)
  );
}

module.exports = {
  name: 'kick',
  description: 'Kick a user by mention, ID, username, or display name.',
  aliases: ['k', 'K'],
  category: 'mod',
  usage: '$kick <@user|userID|username|display name> [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Kick Failed', 'This command only works in servers.')]
      });
    }

    if (!message.member?.permissions?.has(PermissionFlagsBits.KickMembers)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Kick Failed', 'You need **Kick Members** permission.')]
      });
    }

    const prefix = message.prefix || client.getPrefix?.(message.guild.id) || '$';

    if (!args.length) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#fb923c',
            'Kick Command Usage',
            `**Usage:** \`${prefix}kick <@user|userID|username|display name> [reason]\`\n\n**Examples:**\n${prefix}kick @User being rude\n${prefix}kick 123456789012345678 spam\n${prefix}kick xusion being annoying`
          ),
        ],
      });
    }

    const targetInput = args[0];
    const reason = args.slice(1).join(' ').trim() || 'No reason provided';

    const targetUser = await resolveTargetUser(message, targetInput);
    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Kick Failed', 'User not found. Try a mention, user ID, exact username, or display name.')]
      });
    }

    if (targetUser.id === message.author.id) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Kick Failed', 'You cannot kick yourself.')]
      });
    }

    if (targetUser.id === client.user.id) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Kick Failed', 'I cannot kick myself.')]
      });
    }

    const targetMember = await resolveTargetMember(message, targetInput);
    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    if (!targetMember) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Kick Failed', `<@${targetUser.id}> is not in this server.`)]
      });
    }

    if (isOwner(message.guild, targetMember) && !isOwner(message.guild, message.member)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Kick Failed', 'You cannot kick the server owner.')]
      });
    }

    if (!isOwner(message.guild, message.member)) {
      if (getRolePos(targetMember) >= getRolePos(message.member)) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Kick Failed', 'You cannot kick someone with equal or higher role.')]
        });
      }
    }

    if (botMember && getRolePos(targetMember) >= getRolePos(botMember)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Kick Failed', 'I cannot kick that user because my role is too low.')]
      });
    }

    if (!targetMember.kickable) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Kick Failed', 'I cannot kick that user (insufficient permissions or role hierarchy).')]
      });
    }

    try {
      await targetMember.kick(`${reason} (kicked by ${message.author.tag})`);

      try {
        logModAction(client, message.guild.id, message.author.id, targetUser.id, 'kick', reason);
      } catch (err) {
        console.error('[Kick] logModAction failed:', err);
      }

      const embed = new EmbedBuilder()
        .setColor('#fb923c')
        .setTitle('User Kicked')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: false },
          { name: 'Kicked by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Kick command error:', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Failed to Kick User', 'There was an error trying to kick the user.')]
      });
    }
  },
};