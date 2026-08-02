const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');
const { resolveUser, resolveMember } = require('../../handlers/universalHelper');

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
  return guild?.ownerId === member?.id;
}

function getWarnCount(client, guildId, userId) {
  try {
    if (!client.automodDB) return 0;
    const row = client.automodDB.prepare(`
      SELECT COUNT(*) AS count
      FROM automod_warns
      WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);
    return row?.count || 0;
  } catch (err) {
    console.error('[Warn Count] error:', err);
    return 0;
  }
}

module.exports = {
  name: 'warn',
  aliases: ['w'],
  description: 'Warn a user.',
  category: 'mod',
  usage: '$warn <@user|ID|username> <reason>',

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Failed', 'This command can only be used in servers.')]
      });
    }

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Failed', 'You need **Moderate Members** permission.')]
      });
    }

    const prefix = message.prefix || client.getPrefix?.(message.guild.id) || '$';

    if (!args.length) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#facc15',
            'Warn Usage',
            `**Usage:**\n\`${prefix}warn <@user|ID|username> <reason>\`\n\nExample:\n\`${prefix}warn @User spam\``
          )
        ]
      });
    }

    const targetInput = args.shift();
    const reason = args.join(' ').trim() || 'No reason provided';

    const targetUser = await resolveUser(client, message, targetInput);
    if (!targetUser) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Warn Failed', 'User not found. Use a mention, ID, or exact username.')]
      });
    }

    if (targetUser.id === message.author.id) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Failed', 'You cannot warn yourself.')]
      });
    }

    if (targetUser.id === client.user.id) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Failed', 'You cannot warn the bot.')]
      });
    }

    const member = await resolveMember(client, message, targetInput);
    if (!member) {
      return message.reply({
        embeds: [makeEmbed('#f59e0b', 'Warn Failed', 'User is not in this server.')]
      });
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    if (isOwner(message.guild, member) && !isOwner(message.guild, message.member)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Failed', 'You cannot warn the server owner.')]
      });
    }

    if (!isOwner(message.guild, message.member)) {
      if (getRolePos(member) >= getRolePos(message.member)) {
        return message.reply({
          embeds: [makeEmbed('#ef4444', 'Warn Failed', 'You cannot warn someone with equal or higher role.')]
        });
      }
    }

    if (botMember && getRolePos(member) >= getRolePos(botMember)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Failed', 'I cannot warn this user because my role is too low.')]
      });
    }

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Failed', 'Cannot warn an administrator.')]
      });
    }

    if (!client.automodDB) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Failed', 'Warning database unavailable.')]
      });
    }

    try {
      client.automodDB.prepare(`
        INSERT INTO automod_warns
        (guild_id,user_id,moderator_id,reason,timestamp)
        VALUES (?,?,?,?,?)
      `).run(
        message.guild.id,
        targetUser.id,
        message.author.id,
        reason,
        Date.now()
      );

      const warnCount = getWarnCount(client, message.guild.id, targetUser.id);

      client.automodDB.prepare(`
        INSERT OR REPLACE INTO automod_warn_counts
        (guild_id,user_id,count)
        VALUES (?,?,?)
      `).run(
        message.guild.id,
        targetUser.id,
        warnCount
      );

      logModAction(client, message.guild.id, message.author.id, targetUser.id, 'warn', reason);

      if (warnCount >= 5) {
        await member.ban({
          reason: `Auto-ban: reached 5 warnings`
        }).catch(() => null);

        return message.reply({
          embeds: [
            makeEmbed(
              '#ef4444',
              'User Auto-Banned',
              `<@${targetUser.id}> reached **5/5 warnings** and was automatically banned.`
            )
          ]
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#facc15')
        .setTitle('User Warned')
        .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: 'User', value: `<@${targetUser.id}>`, inline: false },
          { name: 'Moderator', value: `<@${message.author.id}>`, inline: false },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Warnings', value: `${warnCount}/5`, inline: true }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[Warn Error]', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Warn Failed', 'Failed to add warning.')]
      });
    }
  }
};