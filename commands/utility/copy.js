module.exports = {
  name: 'copy',
  aliases: [],
  description: "Reply to a message with `copy id` to get that user's ID.",
  category: 'utility',
  usage: '$copy id (reply to a user\'s message)',

  async execute(client, message, args) {
    if (!message.guild) return;

    const sub = String(args[0] || '').toLowerCase();

    // Only "copy id" is supported for now.
    if (sub !== 'id') {
      return message.reply({
        content: 'Usage: `copy id` (reply to a message)',
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }

    if (!message.reference?.messageId) {
      return message.reply({
        content: 'Reply to a user\'s message with this command to get their ID.',
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }

    const referenced = await message
      .fetchReference()
      .catch(() => null);

    if (!referenced?.author) {
      return message.reply({
        content: 'I could not find the message you replied to.',
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }

    // Send only the ID so it is easy to long-press / select and copy.
    return message.reply({
      content: referenced.author.id,
      allowedMentions: { repliedUser: false },
    }).catch(() => {});
  },
};