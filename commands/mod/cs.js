
const {
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

function countAndClear(cache, channelId) {
  if (!cache?.has?.(channelId)) return 0;

  const value = cache.get(channelId);
  let count = 0;

  if (Array.isArray(value)) {
    count = value.length;
  } else if (typeof value?.size === 'number') {
    count = value.size;
  } else if (value != null) {
    count = 1;
  }

  cache.delete(channelId);
  return count;
}

module.exports = {
  name: 'cs',
  description: 'Clears all snipe cache history in the current channel.',
  category: 'mod',
  usage: 'cs',

  async execute(client, message) {
    if (!message.guild) return;

    if (!message.member?.permissions?.has(
      PermissionsBitField.Flags.ManageMessages
    )) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription(
              'You need the **Manage Messages** permission to use this command.'
            ),
        ],
      });
    }

    const channelId = message.channel.id;

    const totalCleared =
      countAndClear(client.snipes, channelId) +
      countAndClear(client.snipesImage, channelId) +
      countAndClear(client.edits, channelId) +
      countAndClear(client.reactionSnipes, channelId);

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setDescription(
        `**${totalCleared.toLocaleString()}** snipe(s) have been cleared`
      );

    return message.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};
