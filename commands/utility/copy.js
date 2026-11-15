
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'copy',
  aliases: [],
  description: "Reply to a user's message with `copy id` to get their ID.",
  category: 'utility',
  usage: '$copy id (reply to a user\'s message)',

  async execute(client, message, args) {
    if (!message.guild) return;

    const sub = String(args[0] || '').toLowerCase();

    if (sub !== 'id') return;

    if (!message.reference?.messageId) {
      return message.reply({
        content: 'Reply to a user\'s message with this command to get their ID.',
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }

    const referenced = await message.fetchReference().catch(() => null);

    if (!referenced?.author) {
      return message.reply({
        content: 'I could not find the message you replied to.',
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setDescription(
        `**User ID**\n\`\`\`\n${referenced.author.id}\n\`\`\``
      );

    return message.reply({
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    }).catch(() => {});
  },
};
