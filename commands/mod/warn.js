const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const WARN_FILE = path.join(__dirname, '../../warns.json');

function loadWarns() {
  try {
    return JSON.parse(fs.readFileSync(WARN_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveWarns(data) {
  fs.writeFileSync(WARN_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  name: 'warn',
  description: 'Warn a user. Auto-bans at 5 warns.',
  category: 'mod',
  usage: '$warn <@user|userID> <reason>',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command can only be used in a server.');

    const perms = message.member.permissions;
    const canMod =
      perms.has(PermissionFlagsBits.ModerateMembers) ||
      perms.has(PermissionFlagsBits.Administrator);

    if (!canMod)
      return message.reply('You need **Moderate Members** permission or admin.');

    const targetArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    if (!targetArg)
      return message.reply('Mention a user or provide a valid ID.');

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser)
      return message.reply('Could not find that user.');

    if (targetUser.id === message.author.id)
      return message.reply('You cannot warn yourself.');

    if (targetUser.id === client.user.id)
      return message.reply('I cannot warn myself.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member)
      return message.reply('That user is not in this server.');

    if (member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('You cannot warn an administrator.');

    const warns = loadWarns();
    if (!warns[targetUser.id]) warns[targetUser.id] = [];

    warns[targetUser.id].unshift({
      reason,
      moderator: `${message.author.tag} (${message.author.id})`,
      timestamp: new Date().toISOString(),
    });

    const warnCount = warns[targetUser.id].length;

    // 🔨 SAVE FIRST
    saveWarns(warns);

    // 🚨 AUTO-BAN AT 5 WARNS
    if (warnCount >= 5) {
      try {
        await member.ban({
          reason: `Reached 5 warns | Last reason: ${reason}`,
        });

        delete warns[targetUser.id];
        saveWarns(warns);

        const banEmbed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('User Banned (Warn Limit Reached)')
          .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
          .addFields(
            {
              name: 'User',
              value: `${targetUser.tag} (${targetUser.id})`,
              inline: false,
            },
            {
              name: 'Banned by',
              value: `${message.author.tag} (${message.author.id})`,
              inline: false,
            },
            {
              name: 'Reason',
              value: 'Reached **5 warnings**',
              inline: false,
            },
          )
          .setTimestamp();

        return message.reply({ embeds: [banEmbed] });
      } catch (err) {
        console.error('Auto-ban failed:', err);
        return message.reply('User hit 5 warns but I could not ban them.');
      }
    }

    // ⚠️ NORMAL WARN EMBED
    const warnEmbed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle('User Warned')
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .addFields(
        {
          name: 'User',
          value: `${targetUser.tag} (${targetUser.id})`,
          inline: false,
        },
        {
          name: 'Warned by',
          value: `${message.author.tag} (${message.author.id})`,
          inline: false,
        },
        {
          name: 'Reason',
          value: reason,
          inline: false,
        },
        {
          name: 'Total Warns',
          value: `${warnCount}/5`,
          inline: false,
        },
      )
      .setTimestamp();

    await message.reply({ embeds: [warnEmbed] });
  },
};