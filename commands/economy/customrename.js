const { EmbedBuilder } = require('discord.js');
const { getCustomRoleByRoleId } = require('../../handlers/shopSystem');

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  return embed;
}

module.exports = {
  name: 'customrename',
  aliases: [],
  description: 'Rename your custom role.',
  category: 'economy',
  usage: '$customrename <role id> <new name>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const roleId = String(args[0] || '').trim();
    const newName = args.slice(1).join(' ').trim();

    if (!roleId || !newName) {
      return message.reply('Use: `$customrename <role id> <new name>`');
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
      name: newName,
      reason: `Custom rename by ${message.author.tag}`,
    }).catch(() => null);

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Custom Role Updated',
          description: `Your role was renamed to **${newName}**.`,
          thumbnail: message.author.displayAvatarURL({ size: 256 }),
        }),
      ],
    });
  },
};