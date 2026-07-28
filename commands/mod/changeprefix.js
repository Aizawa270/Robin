const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'changeprefix',
  aliases: ['cp'],
  hidden: true,
  description: 'Change the bot prefix for this server.',
  usage: '$changeprefix <newPrefix>',
  category: 'Utility',

  async execute(client, message, args) {
    // ============================================================
    // ONLY THESE USERS CAN CHANGE THE PREFIX
    // ============================================================

    const allowedUsers = [
      '852839588689870879',
      '965303319784464454',
    ];

    if (!allowedUsers.includes(message.author.id)) {
      return message.reply(
        '❌ You are not authorized to change the bot prefix.'
      );
    }

    // ============================================================
    // SERVER ONLY
    // ============================================================

    if (!message.guild) {
      return message.reply(
        '❌ This command can only be used inside a server.'
      );
    }

    // ============================================================
    // GET NEW PREFIX
    // ============================================================

    const newPrefix = args[0];

    if (!newPrefix) {
      return message.reply(
        `❌ Provide a new prefix.\n\nExample:\n\`$changeprefix !\``
      );
    }

    // ============================================================
    // PREFIX VALIDATION
    // ============================================================

    if (newPrefix.length > 5) {
      return message.reply(
        '❌ The prefix cannot be longer than 5 characters.'
      );
    }

    if (/\s/.test(newPrefix)) {
      return message.reply(
        '❌ The prefix cannot contain spaces.'
      );
    }

    // ============================================================
    // PREVENT MENTION PREFIXES
    // ============================================================

    if (
      newPrefix.includes('<@') ||
      newPrefix.includes('>')
    ) {
      return message.reply(
        '❌ Mention-based prefixes are not allowed.'
      );
    }

    // ============================================================
    // MAKE SURE PREFIX DATABASE EXISTS
    // ============================================================

    if (!client.prefixDB) {
      return message.reply(
        '❌ Prefix database is not initialized. Please restart the bot and try again.'
      );
    }

    try {
      // ==========================================================
      // GET OLD PREFIX
      // ==========================================================

      const oldPrefix =
        client.getPrefix(message.guild.id) || '$';

      // ==========================================================
      // SAVE NEW PREFIX
      // ==========================================================

      client.prefixDB
        .prepare(`
          INSERT OR REPLACE INTO prefixes
          (guild_id, prefix)
          VALUES (?, ?)
        `)
        .run(
          message.guild.id,
          newPrefix
        );

      // ==========================================================
      // CONFIRM
      // ==========================================================

      return message.reply(
        `✅ Server prefix updated successfully.\n\n` +
        `**Old prefix:** \`${oldPrefix}\`\n` +
        `**New prefix:** \`${newPrefix}\`\n\n` +
        `Use \`${newPrefix}help\` for the help menu.`
      );

    } catch (error) {
      console.error(
        '[ChangePrefix] Failed to change prefix:',
        error
      );

      return message.reply(
        '❌ Failed to change the server prefix. Check the bot console for the error.'
      );
    }
  },
};