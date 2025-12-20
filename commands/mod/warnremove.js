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
  description: 'Remove a specific warn from a user.',
  category: 'mod',
  usage: '$warnremove <@user|userID> <warnNumber>',
  aliases: ['wrnremove'],
  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
      !message.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return message.reply('You lack permissions.');
    }

    const targetArg = args.shift();
    const indexArg = args.shift();

    if (!targetArg || !indexArg)
      return message.reply('Usage: $warnremove <user> <number>');

    const targetUser =
      message.mentions.users.first() ||
      (await client.users.fetch(targetArg).catch(() => null));

    if (!targetUser) return message.reply('User not found.');

    const warnIndex = parseInt(indexArg) - 1;
    if (isNaN(warnIndex)) return message.reply('Invalid warn number.');

    const warns = loadWarns();
    if (!warns[targetUser.id] || !warns[targetUser.id][warnIndex])
      return message.reply('Warn not found.');

    const removed = warns[targetUser.id].splice(warnIndex, 1)[0];
    saveWarns(warns);

    const embed = new EmbedBuilder()
      .setColor('#facc15')
      .setTitle('Warn Removed')
      .addFields(
        { name: 'User', value: `<@${targetUser.id}>`, inline: false }, // fake ping
        { name: 'Removed by', value: `<@${message.author.id}>`, inline: false }, // fake ping
        { name: 'Removed Reason', value: removed.reason, inline: false },
        { name: 'Remaining Warns', value: `${warns[targetUser.id].length}`, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};