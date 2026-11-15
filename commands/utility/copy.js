const { EmbedBuilder } = require('discord.js');

function errorEmbed(description) {
  return new EmbedBuilder()
    .setColor('#ef4444')
    .setDescription(description);
}

module.exports = {
  name: 'copy',
  aliases: [],
  description: "Reply to a message with `copy id` to get that user's ID.",
  category: 'utility',
  usage: '$copy id (reply to a user\'s message)',

  async execute(client, message, args) {
    if (!message.guild) return;

    const sub = String(args[0] || '').toLowerCase();

    if (sub !== 'id') {
      return message.reply({
        embeds: [
          errorEmbed('Usage: `copy id` (reply to a message)')
        ],
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }

    if (!message.reference?.messageId) {
      return message.reply({
        embeds: [
          errorEmbed(
            'Reply to a user\'s message with this command to get their ID.'
          )
        ],
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }

    const referenced = await message
      .fetchReference()
      .catch(() => null);

    if (!referenced?.author) {
      return message.reply({
        embeds: [
          errorEmbed('I could not find the message you replied to.')
        ],
        allowedMentions: { repliedUser: false },
      }).catch(() => {});
    }

    const userId = referenced.author.id;

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('User ID')
      .setDescription(`\`\`\`\n${userId}\n\`\`\``)
      .setThumbnail(
        referenced.author.displayAvatarURL({ size: 256 })
      );

    return message.reply({
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    }).catch(() => {});
  },
};