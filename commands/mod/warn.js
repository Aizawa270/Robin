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
    if (!message.guild) return;

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('You lack permissions.');
    }

    const targetArg = args.shift();
    const reason = args.join(' ') || 'No reason provided';

    if (!targetArg) return message.reply('Provide a user.');

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const member = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return message.reply('User not in server.');

    if (member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('Admins are immune.');

    const warns = loadWarns();
    if (!warns[targetUser.id]) warns[targetUser.id] = [];

    warns[targetUser.id].unshift({
      reason,
      moderator: `${message.author.tag} (${message.author.id})`,
      timestamp: new Date().toISOString(),
    });

    saveWarns(warns);

    const warnCount = warns[targetUser.id].length;

    // AUTO BAN
    if (warnCount >= 5) {
      try {
        await member.ban({ reason: `Reached 5 warns | ${reason}` });
        delete warns[targetUser.id];
        saveWarns(warns);

        const banEmbed = new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('User Banned')
          .addFields(
            { name: 'User', value: `<@${targetUser.id}>`, inline: false },
            { name: 'Reason', value: 'Reached **5 warnings**', inline: false }
          )
          .setTimestamp();

        return message.reply({ embeds: [banEmbed] });
      } catch {
        return message.reply('Failed to ban user.');
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle('User Warned')
      .addFields(
        { name: 'User', value: `<@${targetUser.id}>`, inline: false }, // fake blue ping
        { name: 'Moderator', value: `<@${message.author.id}>`, inline: false }, // fake blue ping
        { name: 'Reason', value: reason, inline: false },
        { name: 'Total Warns', value: `${warnCount}/5`, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};