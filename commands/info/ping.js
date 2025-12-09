console.log('Loaded command: ping.js');

const { EmbedBuilder } = require('discord.js');
const { colors } = require('../../config');

module.exports = {
  name: 'ping',
  description: 'Shows bot latency and API latency.',
  category: 'info',
  usage: '$ping',
  async execute(client, message) {
    const sent = await message.reply('Pinging...');
    const botPing = sent.createdTimestamp - message.createdTimestamp;
    const apiPing = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setColor(colors.ping)
      .addFields(
        { name: 'Bot Ping', value: `${botPing}ms`, inline: true },
        { name: 'API Ping', value: `${apiPing}ms`, inline: true },
      );

    if (message.guild?.iconURL()) {
      embed.setThumbnail(message.guild.iconURL({ size: 1024 }));
    }

    await sent.edit({ content: '', embeds: [embed] });
  },
};