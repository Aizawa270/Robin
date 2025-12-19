const { EmbedBuilder } = require('discord.js');

// Store last 15 reactions per channel
const reactionSnipes = new Map(); // key: channelId, value: array of reactions

module.exports = {
  name: 'snipereaction',
  description: 'Stores last 15 reactions in each channel.',
  category: 'utility',
  hidden: true, // Not shown in help
  maxSnipes: 15, // maximum stored reactions
  async execute(client) {
    client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) return; // ignore bots
      try {
        // Fetch partials if necessary
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        const channelId = reaction.message.channel.id;
        if (!reactionSnipes.has(channelId)) reactionSnipes.set(channelId, []);

        const arr = reactionSnipes.get(channelId);

        arr.push({
          emoji: reaction.emoji.toString(),
          user: { tag: user.tag, id: user.id },
          messageId: reaction.message.id,
          messageContent: reaction.message.content,
          timestamp: new Date()
        });

        // Keep only the last 15
        if (arr.length > module.exports.maxSnipes) arr.shift();

        reactionSnipes.set(channelId, arr);
      } catch (err) {
        console.error('Reaction snipe error:', err);
      }
    });
  },

  // Optional helper to fetch snipes for a channel
  getSnipes(channelId) {
    return reactionSnipes.get(channelId) || [];
  }
};