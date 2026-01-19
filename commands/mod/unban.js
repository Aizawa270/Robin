// commands/mod/unban.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

// Role hierarchy configuration
const ROLE_HIERARCHY = {
  TRIAL_MOD: ['1431651114008318002', '1432014943900799097'],
  MOD: ['1431650911784144967', '1432015132346810499'],
  ADMIN: ['1431650662076256326', '1432015058959073291']
};

// For unban, we can't check target roles since they're not in the server
// We'll allow unbans for all non-admins, but you can modify this if needed
function canUnban(moderator) {
  const modRoles = moderator.roles.cache;
  
  // Only admins can unban (optional - remove this if you want mods to unban too)
  // const isAdmin = ROLE_HIERARCHY.ADMIN.some(roleId => modRoles.has(roleId));
  // if (!isAdmin) return false;
  
  return true; // Allow anyone with ban permissions to unban
}

module.exports = {
  name: 'unban',
  description: 'Unban a user by ID or mention.',
  category: 'mod',
  usage: '$unban <userID|@user>',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command only works in servers.');

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('You need the **Ban Members** permission.');
    }

    // 🔹 Optional: Restrict unbanning to specific roles
    // if (!canUnban(message.member)) {
    //   return message.reply('You do not have permission to unban users.');
    // }

    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';
    if (!args.length) {
      const usage = new EmbedBuilder()
        .setColor('#fde047')
        .setTitle('Unban Command Usage')
        .setDescription(`**Usage:** \`${prefix}unban <userID|@user>\`\n\nExamples:\n${prefix}unban 123456789012345678\n${prefix}unban @User`);
      return message.reply({ embeds: [usage] });
    }

    // Resolve target: mention or ID only
    let userId = null;
    const mentioned = message.mentions.users.first();
    if (mentioned) userId = mentioned.id;
    else if (args[0] && /^\d{17,20}$/.test(args[0])) userId = args[0];

    if (!userId) return message.reply('Provide a valid user mention or ID.');

    try {
      const banInfo = await message.guild.bans.fetch(userId).catch(() => null);
      if (!banInfo) {
        const embed = new EmbedBuilder()
          .setColor('#f59e0b')
          .setTitle('Not Banned')
          .setDescription(`<@${userId}> is not banned or the ID is invalid.`)
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      await message.guild.bans.remove(userId, `Unbanned by ${message.author.tag}`);

      try {
        logModAction(client, message.guild.id, message.author.id, userId, 'unban', 'Unbanned by moderator');
      } catch (err) {
        console.error('[Unban] logModAction failed:', err);
      }

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('User Unbanned')
        .addFields(
          { name: 'User', value: `<@${banInfo.user.id}>`, inline: false },
          { name: 'Unbanned by', value: `<@${message.author.id}>`, inline: false },
          { name: 'Original Ban Reason', value: banInfo.reason || 'No reason provided', inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[Unban] Error:', err);
      await message.reply('Failed to unban the user.');
    }
  },
};
