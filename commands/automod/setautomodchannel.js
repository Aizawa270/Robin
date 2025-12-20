// commands/automod/setautomodchannel.js
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'setautomodchannel',
  aliases: ['saal'],
  description: 'Set the channel where automod alerts are posted.',
  category: 'automod',
  hidden: true,
  usage: '$setautomodchannel #channel',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('Admins only.');

    const channel = message.mentions.channels.first() || (args[0] && message.guild.channels.cache.get(args[0]));
    if (!channel) return message.reply('Mention a channel or pass its ID.');

    client.automod.setAutomodChannel(message.guild.id, channel.id);

    const embed = new EmbedBuilder()
      .setTitle('Automod Alert Channel Set')
      .setColor('#60a5fa')
      .setDescription(`Automod alerts will be posted to ${channel}`);

    await message.reply({ embeds: [embed] });
  },
};