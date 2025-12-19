const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipereaction',
  aliases: ['sr'], // alias added
  description: 'Stores the last 15 reactions in each channel.',
  category: 'utility',
  hidden: true, // Not shown in help
  maxSnipes: 15, // Maximum reactions to store
  snipes: new Map(), // channelId => array of reactions
  async execute(client, message, args) {
    const channelSnipes = this.snipes.get(message.channel.id) || [];
    if (!channelSnipes.length) return message.reply('No reaction snipes in this channel.');

    // Display snipes
    const embed = new EmbedBuilder()
      .setTitle(`Last ${this.maxSnipes} Reactions in #${message.channel.name}`)
      .setColor('#f472b6')
      .setDescription(
        channelSnipes
          .slice(-this.maxSnipes)
          .map((s, i) => `**${i + 1}.** ${s.emoji} by ${s.user.tag}`)
          .join('\n')
      )
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};

// -------------------------------
// Event listener (to put in your main bot file):
// -------------------------------
// client.on('messageReactionAdd', (reaction, user) => {
//   if (user.bot) return; // ignore bots
//   const snipereaction = client.commands.get('snipereaction');
//   if (!snipereaction.snipes.has(reaction.message.channel.id)) {
//     snipereaction.snipes.set(reaction.message.channel.id, []);
//   }
//   const arr = snipereaction.snipes.get(reaction.message.channel.id);
//   arr.push({ emoji: reaction.emoji.name, user });
//   if (arr.length > snipereaction.maxSnipes) arr.shift(); // keep max 15
// });