const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'poll',
  description: 'Creates a simple yes/no poll.',
  category: 'misc',
  usage: '$poll <question>',
  async execute(client, message, args) {
    const question = args.join(' ');

    if (!question) {
      return message.reply(
        'Please provide a question. Example: `$poll Do you like this bot?`',
      );
    }

    const embed = new EmbedBuilder()
      .setColor(colors.poll || '#c084fc')
      .setTitle('Poll')
      .setDescription(question)
      .setFooter({ text: `Poll by ${message.author.tag}` });

    const pollMessage = await message.reply({ embeds: [embed] });

    try {
      await pollMessage.react('👍'); // like
      await pollMessage.react('👎'); // dislike
    } catch (err) {
      console.error('Error adding reactions to poll:', err);
    }
  },
};