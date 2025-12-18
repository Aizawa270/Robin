const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'snipe',
  description: 'Shows deleted messages. Usage: $snipe [1-15]',
  aliases: ['s'],
  category: 'utility',
  async execute(client, message, args) {
    if (!client.snipes) return message.reply('Snipe feature is not enabled.');

    const snipes = client.snipes.get(message.channel.id);
    if (!snipes || !snipes.length) 
      return message.reply('No deleted messages found in this channel.');

    const index = parseInt(args[0]) - 1 || 0;
    if (index < 0 || index >= snipes.length) 
      return message.reply(`Please provide a valid index between 1 and ${snipes.length}.`);

    const data = snipes[index];

    const embed = new EmbedBuilder()
      .setColor('Orange')
      .setAuthor({ 
        name: data.author.tag, 
        iconURL: data.author.displayAvatarURL({ dynamic: true }) 
      })
      .setDescription(data.content || '[No Text Content]')
      .setTimestamp(data.createdAt);

    if (data.attachments && data.attachments.size) {
      const attachment = data.attachments.first();
      if (attachment) embed.setImage(attachment.url);
    }

    message.channel.send({ embeds: [embed] });
  },
};