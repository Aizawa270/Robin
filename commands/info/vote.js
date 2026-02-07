const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'vote',
  description: 'Vote for the server on top.gg',
  category: 'info',
  usage: 'vote',
  aliases: ['topgg', 'upvote'],
  async execute(client, message, args) {
    const voteEmbed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setAuthor({ 
        name: `Vote for ${message.guild.name}`, 
        iconURL: message.guild.iconURL() 
      })
      .setTitle('Click here to vote!')
      .setURL('https://top.gg/discord/servers/783992925687128064/vote')
      .setDescription(
        '**Support us by voting!**\n\n' +
        'Click the title above to vote for our server on top.gg\n\n' +
        '✨ Every vote helps us grow!\n' +
        '💜 Thank you for your support!'
      )
      .setFooter({ text: 'Vote daily to support the server!' })
      .setTimestamp();

    await message.reply({ embeds: [voteEmbed] });
  }
};
