const { EmbedBuilder } = require('discord.js');
const { ownerId } = require('../../config');

function makeEmbed(color, title, description) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

function isOwnerOrServerOwner(message) {
  return message.author.id === ownerId || message.author.id === message.guild?.ownerId;
}

function resolveChannel(message, raw) {
  if (!raw) return null;

  const query = String(raw).trim();
  if (!query) return null;

  const mention = message.mentions.channels.first();
  if (mention && query.includes(mention.id)) return mention;

  const id = query.replace(/[<#>]/g, '');
  if (/^\d{15,20}$/.test(id)) {
    return message.guild.channels.cache.get(id) || null;
  }

  return null;
}

module.exports = {
  name: 'removelockdown',
  description: 'Removes lockdown from a channel.',
  category: 'mod',
  usage: '!removelockdown #channel',
  aliases: [],

  async execute(client, message, args) {
    if (!message.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Remove Lockdown Failed', 'This command can only be used in a server.')]
      });
    }

    if (!isOwnerOrServerOwner(message)) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Remove Lockdown Failed', 'You do not have permission to use this command.')]
      });
    }

    const channelArg = args[0];

    if (!channelArg) {
      return message.reply({
        embeds: [
          makeEmbed(
            '#f59e0b',
            'Remove Lockdown Usage',
            `Use \`${message.prefix || '!'}removelockdown #channel/channel_id\`\n\nExample:\n\`${message.prefix || '!'}removelockdown #general\``
          )
        ]
      });
    }

    const channel = resolveChannel(message, channelArg);

    if (!channel || !channel.permissionOverwrites?.edit || !channel.guild) {
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Invalid Channel', 'Please provide a valid text channel or channel ID.')]
      });
    }

    try {
      await channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: null,
          AddReactions: null,
          CreatePublicThreads: null,
          CreatePrivateThreads: null,
          SendMessagesInThreads: null,
        }
      );

      return message.reply({
        embeds: [
          makeEmbed('#10b981', 'Lockdown Removed', `🔓 Lockdown removed in ${channel}.`)
        ]
      });
    } catch (err) {
      console.error('RemoveLockdown error:', err);
      return message.reply({
        embeds: [makeEmbed('#ef4444', 'Remove Lockdown Failed', 'There was an error removing the lockdown.')]
      });
    }
  },
};