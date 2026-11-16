const {
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  name: 'setautomodchannel',
  aliases: ['saal'],
  description: 'Set the channel where automod alerts are posted.',
  category: 'automod',
  hidden: true,
  usage: '$setautomodchannel #channel',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (
      !message.member?.permissions?.has(
        PermissionFlagsBits.Administrator
      )
    ) {
      return message.reply(
        'You need the **Administrator** permission to configure automod.'
      );
    }

    if (!client.automod) {
      return message.reply(
        'Automod is not initialized. Please restart the bot.'
      );
    }

    const channel =
      message.mentions.channels.first() ||
      (
        args[0]
          ? await message.guild.channels
              .fetch(args[0].replace(/[<#>]/g, ''))
              .catch(() => null)
          : null
      );

    if (!channel || !channel.isTextBased()) {
      return message.reply(
        'Please mention a valid text channel or provide its ID.'
      );
    }

    const success = client.automod.setAutomodChannel(
      message.guild.id,
      channel.id
    );

    if (!success) {
      return message.reply(
        'Failed to save the automod alert channel.'
      );
    }

    const saved = client.automod.getAutomodChannel(
      message.guild.id
    );

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({
        name: 'Automod • Configuration',
        iconURL: message.guild.iconURL({ size: 128 }) || undefined,
      })
      .setTitle('Alert channel updated')
      .setDescription(
        `Automod alerts will now be delivered to ${channel}.`
      )
      .addFields(
        {
          name: 'Channel',
          value: `${channel}`,
          inline: true,
        },
        {
          name: 'Status',
          value: saved === channel.id ? 'Configured' : 'Unverified',
          inline: true,
        }
      )
      .setFooter({
        text: `Configured by ${message.author.tag}`,
      })
      .setTimestamp();

    return message.reply({
      embeds: [embed],
    });
  },
};