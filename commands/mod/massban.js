const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

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

module.exports = {
  name: 'massban',
  aliases: ['MB', 'mb'],
  description: 'Ban multiple users at once (max 10).',
  category: 'mod',
  usage: '$massban <@user|userID> <@user|userID> ... [reason]',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Mass Ban Failed', 'This command can only be used in a server.')] });
    }

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [makeEmbed('#ef4444', 'Mass Ban Failed', 'Only administrators can use this command.')] });
    }

    if (!args.length) {
      return message.reply({ embeds: [makeEmbed('#f59e0b', 'Mass Ban Failed', 'You need to provide at least **1 user** to ban.')] });
    }

    const userIds = new Set();

    message.mentions.users.forEach(u => userIds.add(u.id));

    for (const arg of args) {
      if (/^\d{17,20}$/.test(arg)) {
        userIds.add(arg);
      }
    }

    if (userIds.size === 0) {
      return message.reply({ embeds: [makeEmbed('#f59e0b', 'Mass Ban Failed', 'No valid users found to ban.')] });
    }

    if (userIds.size > 10) {
      return message.reply({ embeds: [makeEmbed('#f59e0b', 'Mass Ban Failed', 'You can only massban **up to 10 users at once**.')] });
    }

    const existingBans = await message.guild.bans.fetch().catch(() => null);
    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    const banned = [];
    const alreadyBanned = [];
    const failed = [];

    for (const userId of userIds) {
      try {
        if (userId === message.author.id || userId === client.user.id) {
          failed.push(userId);
          continue;
        }

        if (existingBans?.has(userId)) {
          alreadyBanned.push(userId);
          continue;
        }

        const member = await message.guild.members.fetch(userId).catch(() => null);

        if (member) {
          if (isOwner(message.guild, member) && !isOwner(message.guild, message.member)) {
            failed.push(userId);
            continue;
          }

          if (!isOwner(message.guild, message.member) && getRolePos(member) >= getRolePos(message.member)) {
            failed.push(userId);
            continue;
          }

          if (botMember && getRolePos(member) >= getRolePos(botMember)) {
            failed.push(userId);
            continue;
          }

          if (!member.bannable) {
            failed.push(userId);
            continue;
          }
        }

        await message.guild.members.ban(userId, {
          reason: `Mass ban issued by ${message.author.tag}`,
        });

        banned.push(userId);
      } catch {
        failed.push(userId);
      }
    }

    const formatList = arr => (arr.length ? arr.map(id => `• <@${id}>`).join('\n') : 'None');

    const embed = new EmbedBuilder()
      .setColor('#dc2626')
      .setTitle('Mass Ban Results')
      .addFields(
        { name: '✅ Banned', value: formatList(banned), inline: false },
        { name: '⚠️ Already Banned', value: formatList(alreadyBanned), inline: false },
        { name: '❌ Failed', value: formatList(failed), inline: false },
        { name: 'Banned by', value: `<@${message.author.id}>`, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};