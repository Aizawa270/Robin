const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Role hierarchy configuration
const ROLE_HIERARCHY = {
  TRIAL_MOD: ['1431651114008318002', '1432014943900799097'],
  MOD: ['1431650911784144967', '1432015132346810499'],
  ADMIN: ['1431650662076256326', '1432015058959073291']
};

function canModerateTarget(moderator, target) {
  if (!target) return false; // Can't unmute someone not in server

  const modRoles = moderator.roles.cache;
  const targetRoles = target.roles.cache;

  // Check if moderator is trial mod
  const isTrialMod = ROLE_HIERARCHY.TRIAL_MOD.some(roleId => modRoles.has(roleId));
  
  // Check if target is mod or admin
  const targetIsMod = ROLE_HIERARCHY.MOD.some(roleId => targetRoles.has(roleId));
  const targetIsAdmin = ROLE_HIERARCHY.ADMIN.some(roleId => targetRoles.has(roleId));

  if (isTrialMod && (targetIsMod || targetIsAdmin)) {
    return false; // Trial mods can't moderate mods or admins
  }

  // Check if moderator is mod (but not admin)
  const isMod = ROLE_HIERARCHY.MOD.some(roleId => modRoles.has(roleId));
  const isAdmin = ROLE_HIERARCHY.ADMIN.some(roleId => modRoles.has(roleId));

  if (isMod && !isAdmin && targetIsAdmin) {
    return false; // Mods can't moderate admins
  }

  return true;
}

module.exports = {
  name: 'unmute',
  description: 'Remove timeout from a user.',
  category: 'mod',
  usage: '$unmute <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('Server only.');

    const memberPerms = message.member.permissions;
    if (
      !memberPerms.has(PermissionFlagsBits.ModerateMembers) &&
      !memberPerms.has(PermissionFlagsBits.Administrator)
    )
      return message.reply('You need **Timeout Members** permission or admin.');

    if (!args.length) {
      const usageEmbed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('Unmute Command Usage')
        .setDescription(
          '**Usage:**\n' +
          '`$unmute <@user|userID> [reason]`\n\n' +
          '**Examples:**\n' +
          '`$unmute @User spamming ended`\n' +
          '`$unmute 123456789012345678 apology`\n'
        );
      return message.reply({ embeds: [usageEmbed] });
    }

    const targetArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));
    if (!targetUser) return message.reply('User not found.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not in this server.');

    // 🔹 ROLE HIERARCHY CHECK
    if (!canModerateTarget(message.member, member)) {
      return message.reply('You cannot unmute this user due to role hierarchy restrictions.');
    }

    if (member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('Cannot unmute an administrator.');

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('I need **Timeout Members** permission.');

    if (!member.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp < Date.now())
      return message.reply('This user is not muted.');

    try {
      await member.timeout(null, `${reason} (unmuted by ${message.author.tag})`);

      // Logging is intentionally skipped
      console.log(`[Unmute] ${message.author.tag} unmuted ${targetUser.tag}`);

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('✅ User Unmuted')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: false },
          { name: 'Unmuted by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Unmute command error:', err);
      await message.reply('Failed to unmute the user.');
    }
  },
};
