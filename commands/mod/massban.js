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

    const reason = 'Mass ban issued by staff';

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

    const banned = [];
    const failed = [];

    for (const userId of userIds) {
      try {
        await message.guild.members.ban(userId, {
          reason: `${reason} (by ${message.author.tag})`,
        });
        banned.push(userId);
      } catch {
        failed.push(userId);
      }
    }

    // 🔹 Fake pings
    const bannedList = banned.length
      ? banned.map(id => `• <@${id}>`).join('\n')
      : 'None';

    const failedList = failed.length
      ? failed.map(id => `• <@${id}>`).join('\n')
      : 'None';

    const fakeModPing = `<@${message.author.id}>`;

    const embed = new EmbedBuilder()
      .setColor('#dc2626')
      .setTitle('Mass Ban Executed')
      .addFields(
        {
          name: 'Banned Users',
          value: bannedList,
          inline: false,
        },
        {
          name: 'Failed',
          value: failedList,
          inline: false,
        },
        {
          name: 'Banned by',
          value: fakeModPing,
          inline: false,
        },
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};