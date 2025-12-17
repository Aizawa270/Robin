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
  name: 'warnremove',
  description: 'Remove a specific warn from a user. Usage: $warnremove <@user|userID> <warnNumber>',
  category: 'mod',
  usage: '$warnremove <@user|userID> <warnNumber>',
  aliases: ['wrnremove'],
  async execute(client, message, args) {
    if (!message.guild) return message.reply('This command can only be used in a server.');

    const perms = message.member.permissions;
    if (!perms.has(PermissionFlagsBits.ModerateMembers) && !perms.has(PermissionFlagsBits.Administrator))
      return message.reply('You need **Moderate Members** permission or be admin to remove warns.');

    const targetArg = args.shift();
    const indexArg = args.shift();
    if (!targetArg || !indexArg) return message.reply('Usage: $warnremove <@user|userID> <warnNumber>');

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('Could not find that user.');

    const warnIndex = parseInt(indexArg, 10) - 1;
    if (isNaN(warnIndex)) return message.reply('Invalid warn number.');

    const warns = loadWarns();
    if (!warns[targetUser.id] || warns[targetUser.id].length === 0)
      return message.reply('That user has no warns.');

    if (warnIndex < 0 || warnIndex >= warns[targetUser.id].length)
      return message.reply('Invalid warn number for this user.');

    const removed = warns[targetUser.id].splice(warnIndex, 1)[0];
    saveWarns(warns);

    const embed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle('Warn Removed')
      .setThumbnail(targetUser.displayAvatarURL({ size: 1024 }))
      .addFields(
        { name: 'User', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
        { name: 'Removed by', value: `${message.author.tag} (${message.author.id})`, inline: false },
        { name: 'Reason of removed warn', value: removed.reason, inline: false },
        { name: 'Remaining Warns', value: `${warns[targetUser.id].length}`, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};