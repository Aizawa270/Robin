// commands/mod/kick.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

// Role hierarchy configuration
const ROLE_HIERARCHY = {
  TRIAL_MOD: ['1431651114008318002', '1432014943900799097'],
  MOD: ['1431650911784144967', '1432015132346810499'],
  ADMIN: ['1431650662076256326', '1432015058959073291']
};

function canModerateTarget(moderator, target) {
  if (!target) return false; // Can't kick someone not in server

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
  name: 'kick',
  description: 'Kick a user by mention or ID.',
  aliases: ['k', 'K'],
  category: 'mod',
  usage: '$kick <@user|userID> [reason]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('You need **Kick Members** permission.');
    }

    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';

    // Usage embed when no args
    if (!args.length) {
      const usage = new EmbedBuilder()
        .setColor('#fb923c')
        .setTitle('Kick Command Usage')
        .setDescription(
          `**Usage:** \`${prefix}kick <@user|userID> [reason]\`\n\n` +
          `**Examples:**\n${prefix}kick @User being rude\n${prefix}kick 123456789012345678 spam`
        );
      return message.reply({ embeds: [usage] });
    }

    // Resolve target: mention or ID only
    let targetUser = message.mentions.users.first();
    if (!targetUser && args[0] && /^\d{17,20}$/.test(args[0])) {
      targetUser = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!targetUser) {
      return message.reply('User not found. Mention them or provide a valid user ID.');
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);

    // If user not in server -> fail (prevents fake kick)
    if (!targetMember) {
      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('Kick Failed')
        .setDescription(`<@${targetUser.id}> is not in this server.`)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (targetUser.id === message.author.id) return message.reply('You cannot kick yourself.');
    if (targetUser.id === client.user.id) return message.reply('I cannot kick myself.');

    // 🔹 ROLE HIERARCHY CHECK
    if (!canModerateTarget(message.member, targetMember)) {
      return message.reply('You cannot kick this user due to role hierarchy restrictions.');
    }

    if (targetMember.roles.highest.position >= message.member.roles.highest.position) {
      return message.reply('You cannot kick someone with equal or higher role.');
    }

    if (!targetMember.kickable) {
      return message.reply('I cannot kick that user (insufficient bot permissions or role hierarchy).');
    }

    try {
      await targetMember.kick(`${reason} (kicked by ${message.author.tag})`);

      // Log action
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
          { name: 'User', value: `<@${targetUser.id}>` },
          { name: 'Kicked by', value: `<@${message.author.id}>` },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Kick command error:', err);
      const errorEmbed = new EmbedBuilder()
        .setColor('#ef4444')
        .setTitle('Failed to Kick User')
        .setDescription('There was an error trying to kick the user.');

      await message.reply({ embeds: [errorEmbed] });
    }
  },
};
