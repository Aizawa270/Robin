
const {
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

function countCacheEntries(cache, channelId) {
  if (!cache?.has?.(channelId)) {
    return 0;
  }

  const value = cache.get(channelId);

  if (value == null) return 0;

  if (Array.isArray(value)) {
    return value.length;
  }

  if (typeof value.size === 'number') {
    return value.size;
  }

  // A single cached snipe object counts as one entry.
  return 1;
}

function clearChannelCache(cache, channelId) {
  if (!cache?.has?.(channelId)) {
    return 0;
  }

  const count = countCacheEntries(cache, channelId);

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

    if (
      !message.member?.permissions?.has(
        PermissionsBitField.Flags.ManageMessages
      )
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ef4444')
            .setTitle('Permission Denied')
            .setDescription(
              'You need the **Manage Messages** permission to use this command.'
            )
            .setTimestamp(),
        ],
      });
    }

    const channelId = message.channel.id;

    // Count and clear deleted-message snipes.
    const deletedSnipes = clearChannelCache(
      client.snipes,
      channelId
    );

    // Count and clear image snipes, if this cache exists.
    const imageSnipes = clearChannelCache(
      client.snipesImage,
      channelId
    );

    // Count and clear edited-message snipes.
    const editedSnipes = clearChannelCache(
      client.edits,
      channelId
    );

    // Count and clear reaction snipes.
    const reactionSnipes = clearChannelCache(
      client.reactionSnipes,
      channelId
    );

    const totalCleared =
      deletedSnipes +
      imageSnipes +
      editedSnipes +
      reactionSnipes;

    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setTitle('Snipe Cache Cleared')
      .setDescription(
        totalCleared > 0
          ? `Successfully cleared **${totalCleared.toLocaleString()}** cached snipe entr${totalCleared === 1 ? 'y' : 'ies'} in ${message.channel}.`
          : `No cached snipe entries were found in ${message.channel}.`
      )
      .addFields(
        {
          name: 'Deleted Messages',
          value: `${deletedSnipes}`,
          inline: true,
        },
        {
          name: 'Image Snipes',
          value: `${imageSnipes}`,
          inline: true,
        },
        {
          name: 'Edited Messages',
          value: `${editedSnipes}`,
          inline: true,
        },
        {
          name: 'Reaction Snipes',
          value: `${reactionSnipes}`,
          inline: true,
        }
      )
      .setFooter({
        text: `Cleared by ${message.author.tag}`,
      })
      .setTimestamp();

    return message.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};
