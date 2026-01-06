const { PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'purgeuser',
  description: 'Delete recent messages from a specific user (admin only, max 500)',
  category: 'mod',
  usage: '!purgeuser <@user|id> <amount>',
  aliases: [],

  async execute(client, message, args) {
    if (!message.guild) return;

    // 🔒 ADMIN ONLY
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Admins only.');
    }

    const target =
      message.mentions.users.first() ||
      (args[0] && /^\d+$/.test(args[0])
        ? await client.users.fetch(args[0]).catch(() => null)
        : null);

    if (!target) {
      return message.reply('❌ Invalid user. Use a mention or user ID.');
    }

    const amount = parseInt(args[1], 10);
    if (!amount || amount < 1 || amount > 500) {
      return message.reply('❌ Amount must be between **1–500**.');
    }

    let deleted = 0;
    let lastId = null;

    while (deleted < amount) {
      const remaining = amount - deleted;
      const fetchLimit = remaining > 100 ? 100 : remaining;

      const fetched = await message.channel.messages.fetch({
        limit: fetchLimit,
        before: lastId,
      });

      if (!fetched.size) break;

      const userMessages = fetched.filter(
        m =>
          m.author.id === target.id &&
          Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
      );

      if (!userMessages.size) break;

      await message.channel.bulkDelete(userMessages, true);
      deleted += userMessages.size;
      lastId = fetched.last().id;
    }

    return message.reply(`🧹 Deleted **${deleted}** messages from <@${target.id}>.`);
  },
};