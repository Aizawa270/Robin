const { EmbedBuilder } = require('discord.js');
const { getCustomRoleByRoleId } = require('../../handlers/shopSystem');

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  return embed;
}

async function bufferFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch image');
  return Buffer.from(await res.arrayBuffer());
}

module.exports = {
  name: 'customicon',
  aliases: [],
  description: 'Set your custom role icon.',
  category: 'economy',
  usage: '$customicon <role id> (attach image)',

  async execute(client, message, args) {
    if (!message.guild) return;

    const roleId = String(args[0] || '').trim();
    if (!roleId) return message.reply('Use: `$customicon <role id>` and attach an image.');

    const row = getCustomRoleByRoleId(message.guild.id, roleId);
    if (!row || row.user_id !== message.author.id) {
      return message.reply('That is not your active custom role.');
    }

    const role = message.guild.roles.cache.get(roleId) || await message.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      return message.reply('That custom role no longer exists.');
    }

    const attachment = message.attachments.first();
    if (!attachment) {
      return message.reply('Attach an image with the command.');
    }

    let buffer;
    try {
      buffer = await bufferFromUrl(attachment.url);
    } catch {
      return message.reply('Could not read that image.');
    }

    await role.edit({
      icon: buffer,
      reason: `Custom icon by ${message.author.tag}`,
    }).catch(() => null);

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Custom Role Updated',
          description: 'Your role icon was updated.',
          thumbnail: message.author.displayAvatarURL({ size: 256 }),
        }),
      ],
    });
  },
};