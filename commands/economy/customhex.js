const { EmbedBuilder } = require('discord.js');
const { getCustomRoleByRoleId } = require('../../handlers/shopSystem');

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  return embed;
}

function isHexColor(input) {
  return /^#([0-9a-f]{6})$/i.test(String(input || '').trim());
}

module.exports = {
  name: 'customhex',
  aliases: [],
  description: 'Change your custom role color.',
  category: 'economy',
  usage: '$customhex <role id> <#hex>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const roleId = String(args[0] || '').trim();
    const hex = String(args[1] || '').trim();

    if (!roleId || !hex) {
      return message.reply('Use: `$customhex <role id> <#hex>`');
    }

    if (!isHexColor(hex)) {
      return message.reply('Give a valid hex color like `#ff00aa`.');
    }

    const row = getCustomRoleByRoleId(message.guild.id, roleId);
    if (!row || row.user_id !== message.author.id) {
      return message.reply('That is not your active custom role.');
    }

    const role = message.guild.roles.cache.get(roleId) || await message.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      return message.reply('That custom role no longer exists.');
    }

    await role.edit({
      color: hex,
      reason: `Custom hex by ${message.author.tag}`,
    }).catch(() => null);

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Custom Role Updated',
          description: `Your role color was changed to **${hex}**.`,
          thumbnail: message.author.displayAvatarURL({ size: 256 }),
        }),
      ],
    });
  },
};