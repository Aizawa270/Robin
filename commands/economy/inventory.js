const { EmbedBuilder } = require('discord.js');
const { getInventory, getCustomRoleByUser, money } = require('../../handlers/shopSystem');

function buildEmbed(message, data = {}) {
  if (typeof message.createEmbed === 'function') {
    const embed = message.createEmbed({
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      footer: data.footer,
    });

    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.footer) {
      if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
      else embed.setFooter(data.footer);
    }

    return embed;
  }

  const embed = new EmbedBuilder().setColor('#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) {
    if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
    else embed.setFooter(data.footer);
  }
  return embed;
}

module.exports = {
  name: 'inventory',
  aliases: ['inv'],
  description: 'Show your shop inventory.',
  category: 'economy',
  usage: '$inventory',

  async execute(client, message) {
    if (!message.guild) return;

    const items = getInventory('normal', message.guild.id, message.author.id);
    const custom = getCustomRoleByUser(message.guild.id, message.author.id);

    const lines = [];

    if (custom) {
      const role = message.guild.roles.cache.get(custom.role_id);
      const status = role ? 'In use' : 'Missing';
      lines.push(`**Custom Role**\n↳ ${status}\n↳ Role ID: \`${custom.role_id}\``);
    }

    for (const row of items) {
      const item = client.shopDB
        ? client.shopDB.prepare(`
            SELECT *
            FROM normal_shop_items
            WHERE guild_id = ? AND item_id = ?
          `).get(message.guild.id, row.item_id)
        : null;

      if (!item) continue;

      lines.push(`**${item.name}**\n↳ x${row.quantity}\n↳ Price: ${money(client, item.price)}`);
    }

    const embed = buildEmbed(message, {
      title: `${message.author.username}'s Inventory`,
      description: lines.length ? lines.join('\n\n') : 'Nothing here yet.',
      thumbnail: message.author.displayAvatarURL({ size: 256 }),
    });

    return message.reply({ embeds: [embed] });
  },
};