const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'massban',
  aliases: ['MB', 'mb'],
  description: 'Ban multiple users at once (max 10).',
  category: 'mod',
  usage: '$massban <@user|userID> <@user|userID> ... [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    // 🔒 Admin only
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Only administrators can use this command.');
    }

    if (!args.length) {
      return message.reply('You need to provide at least **1 user** to ban.');
    }

    const reason = `Mass ban issued by ${message.author.tag}`;

    // Collect user IDs
    const userIds = new Set();

    // Mentions
    message.mentions.users.forEach(u => userIds.add(u.id));

    // Raw IDs
    for (const arg of args) {
      if (/^\d{17,20}$/.test(arg)) {
        userIds.add(arg);
      }
    }

    if (userIds.size === 0) {
      return message.reply('No valid users found to ban.');
    }

    if (userIds.size > 10) {
      return message.reply('You can only massban **up to 10 users at once**.');
    }

    // Fetch current bans once (important)
    const existingBans = await message.guild.bans.fetch().catch(() => null);

    const banned = [];
    const alreadyBanned = [];
    const failed = [];

    for (const userId of userIds) {
      try {
        // ✅ Already banned check
        if (existingBans?.has(userId)) {
          alreadyBanned.push(userId);
          continue;
        }

        // Role hierarchy safety (if member exists)
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (
          member &&
          member.roles.highest.position >= message.member.roles.highest.position
        ) {
          failed.push(userId);
          continue;
        }

        await message.guild.members.ban(userId, {
          reason,
        });

        banned.push(userId);
      } catch {
        failed.push(userId);
      }
    }

    const formatList = arr =>
      arr.length ? arr.map(id => `• <@${id}>`).join('\n') : 'None';

    const embed = new EmbedBuilder()
      .setColor('#dc2626')
      .setTitle('Mass Ban Results')
      .addFields(
        {
          name: '✅ Banned',
          value: formatList(banned),
          inline: false,
        },
        {
          name: '⚠️ Already Banned',
          value: formatList(alreadyBanned),
          inline: false,
        },
        {
          name: '❌ Failed',
          value: formatList(failed),
          inline: false,
        },
        {
          name: 'Banned by',
          value: `<@${message.author.id}>`,
          inline: false,
        },
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};