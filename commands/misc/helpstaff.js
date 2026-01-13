// commands/utility/helpstaff.js
const { PermissionFlagsBits } = require('discord.js');
const universalHelper = require('../../utils/universalHelper');

module.exports = {
  name: 'helpstaff',
  description: 'Shows all staff/mod commands.',
  category: 'utility',
  usage: 'helpstaff',
  aliases: ['hstaff', 'staffhelp'],
  async execute(client, message) {
    if (!message.guild) return;

    // hard gate: staff only
    const isStaff =
      message.member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
      message.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isStaff) {
      return message.reply('You are not staff. Relax.');
    }

    // collect staff commands
    const staffCommands = Array.from(client.commands.values()).filter(cmd =>
      !cmd.hidden &&
      (
        cmd.category?.toLowerCase() === 'mod' ||
        cmd.category?.toLowerCase() === 'automod' ||
        cmd.modOnly === true ||
        cmd.staffOnly === true
      )
    );

    if (!staffCommands.length) {
      return message.reply('No staff commands found. That’s bad.');
    }

    // ✅ correct universalHelper call
    return universalHelper({
      client,
      message,
      commands: staffCommands,
      title: 'Staff Commands',
      description: 'Moderator & Automod commands',
      footer: 'Staff Only',
      color: '#ec4899', // 💗 pink (same as help.js)
      thumbnail: client.user.displayAvatarURL({ size: 1024 }),
      perPage: 10,          // 🔥 REQUIRED
      staffOnly: true,      // 🔥 REQUIRED
    });
  },
};