const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('../../handlers/modstatsHelper');

module.exports = {
  name: 'unban',
  description: 'Unban a user by ID, mention, or reply.',
  category: 'mod',
  usage: '$unban <userID | @user | reply>',
  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply('This command can only be used in a server.');
    }

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('You need the **Ban Members** permission.');
    }

    let userId = null;

    // 1️⃣ Mention
    if (message.mentions.users.first()) {
      userId = message.mentions.users.first().id;
    }

    // 2️⃣ Reply
    if (!userId && message.reference?.messageId) {
      const repliedMsg = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch(() => null);
      if (repliedMsg?.author) {
        userId = repliedMsg.author.id;
      }
    }

    // 3️⃣ Raw ID
    if (!userId && args[0] && /^\d{17,20}$/.test(args[0])) {
      userId = args[0];
    }

    if (!userId) {
      const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '$';
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#fde047')
            .setTitle('Unban Command Usage')
            .setDescription(
              '**Usage:**\n' +
              `\`${prefix}unban <userID | @user | reply>\`\n\n` +
              '**Examples:**\n' +
              `\`${prefix}unban 123456789012345678\`\n` +
              `\`${prefix}unban @User\`\n` +
              `Reply to a user → \`${prefix}unban\``
            ),
        ],
      });
    }

    try {
      const banInfo = await message.guild.bans.fetch(userId).catch(() => null);
      if (!banInfo) {
        return message.reply('That user is not banned.');
      }

      await message.guild.bans.remove(
        userId,
        `Unbanned by ${message.author.tag}`
      );

      logModAction(
        client,
        message.guild.id,
        message.author.id,
        userId,
        'unban',
        'Unbanned by moderator'
      );

      const embed = new EmbedBuilder()
        .setColor('#22c55e')
        .setTitle('User Unbanned')
        .addFields(
          { name: 'User', value: `<@${userId}>`, inline: false },
          { name: 'Unbanned by', value: `<@${message.author.id}>`, inline: false },
          {
            name: 'Original Ban Reason',
            value: banInfo.reason || 'No reason provided',
            inline: false,
          }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[Unban] Error:', err);
      await message.reply('Failed to unban the user.');
    }
  },
};