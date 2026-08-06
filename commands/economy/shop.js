const { EmbedBuilder } = require('discord.js');
const {
  canManageShop,
  setupItem,
  deleteItem,
  listShopItems,
  parseDurationMs,
  formatDuration,
  money,
} = require('../../handlers/shopSystem');

function buildEmbed(message, data = {}) {
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

function shopListText(client, items) {
  if (!items.length) return 'No items yet.';

  return items.map(item => {
    const price = money(client, item.price);
    const cooldown = item.custom_duration_ms ? '30 days' : formatDuration(Number(item.cooldown_ms || 0));
    const kind = item.custom_duration_ms ? 'Custom Role' : 'Normal';
    return `**${item.item_id}** • ${item.name}\nPrice: ${price}\nCooldown: ${cooldown}\nType: ${kind}`;
  }).join('\n\n');
}

module.exports = {
  name: 'shop',
  aliases: [],
  description: 'Server shop commands.',
  category: 'economy',
  usage: '$shop | $shop setup <price> <cooldown> <name> | $shop customsetup <price> <name> | $shop delete <id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const sub = String(args[0] || '').toLowerCase();

    if (!sub) {
      const items = listShopItems('normal', message.guild.id);
      const normal = items.filter(i => !i.custom_duration_ms);
      const custom = items.filter(i => i.custom_duration_ms);

      const embed = buildEmbed(message, {
        title: 'Shop',
        description:
          `__Normal Items__\n${shopListText(client, normal)}\n\n` +
          `__Custom Roles__\n${shopListText(client, custom)}`,
        thumbnail: message.guild.iconURL({ size: 256 }),
      });

      return message.reply({ embeds: [embed] });
    }

    if (sub === 'setup') {
      if (!canManageShop(client, message)) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Access Denied',
            description: 'Only the bot owner or server owner can set up shop items.',
          })],
        });
      }

      const price = parseInt(args[1], 10);
      const cooldown = parseDurationMs(args[2]);
      const name = args.slice(3).join(' ').trim();

      if (!Number.isInteger(price) || price <= 0 || cooldown == null || !name) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Setup Failed',
            description: 'Use: `$shop setup <price> <cooldown> <item name>`',
          })],
        });
      }

      const item = setupItem('normal', message.guild.id, {
        name,
        price,
        cooldownMs: cooldown,
      });

      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Shop Item Created',
          description:
            `**${item.item_id}** • ${item.name}\n` +
            `Price: ${money(client, item.price)}\n` +
            `Cooldown: ${formatDuration(item.cooldown_ms)}`,
          thumbnail: message.guild.iconURL({ size: 256 }),
        })],
      });
    }

    if (sub === 'customsetup') {
      if (!canManageShop(client, message)) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Access Denied',
            description: 'Only the bot owner or server owner can set up custom role items.',
          })],
        });
      }

      const price = parseInt(args[1], 10);
      const name = args.slice(2).join(' ').trim();

      if (!Number.isInteger(price) || price <= 0 || !name) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Setup Failed',
            description: 'Use: `$shop customsetup <price> <item name>`',
          })],
        });
      }

      const item = setupItem('normal', message.guild.id, {
        name,
        price,
        cooldownMs: 30 * 24 * 60 * 60 * 1000,
        customDurationMs: 30 * 24 * 60 * 60 * 1000,
      });

      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Custom Role Item Created',
          description:
            `**${item.item_id}** • ${item.name}\n` +
            `Price: ${money(client, item.price)}\n` +
            `Duration: 30 days`,
          thumbnail: message.guild.iconURL({ size: 256 }),
        })],
      });
    }

    if (sub === 'delete') {
      if (!canManageShop(client, message)) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Access Denied',
            description: 'Only the bot owner or server owner can delete shop items.',
          })],
        });
      }

      const itemId = String(args[1] || '').trim();
      if (!itemId) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Delete Failed',
            description: 'Use: `$shop delete <item id>`',
          })],
        });
      }

      const deleted = deleteItem('normal', message.guild.id, itemId);
      if (!deleted) {
        return message.reply({
          embeds: [buildEmbed(message, {
            title: 'Delete Failed',
            description: `Item **${String(itemId).padStart(2, '0')}** was not found.`,
          })],
        });
      }

      return message.reply({
        embeds: [buildEmbed(message, {
          title: 'Shop Item Deleted',
          description: `Deleted **${deleted.item_id}** • ${deleted.name} and renumbered the shop.`,
          thumbnail: message.guild.iconURL({ size: 256 }),
        })],
      });
    }

    return message.reply({
      embeds: [buildEmbed(message, {
        title: 'Shop Help',
        description:
          '`$shop`\n`$shop setup <price> <cooldown> <item name>`\n`$shop customsetup <price> <item name>`\n`$shop delete <item id>`',
      })],
    });
  },
};