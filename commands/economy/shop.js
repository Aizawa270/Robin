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
  const embed = new EmbedBuilder()
    .setColor('#0f172a')
    .setTimestamp();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) {
    if (typeof data.footer === 'string') embed.setFooter({ text: data.footer });
    else embed.setFooter(data.footer);
  }

  return embed;
}

function itemLine(client, item) {
  const price = money(client, item.price);
  const cooldown = item.custom_duration_ms
    ? '30 days'
    : formatDuration(Number(item.cooldown_ms || 0));

  return `**${item.item_id}.** ${item.name}\n` +
         `Price: ${price}\n` +
         `Cooldown: ${cooldown}`;
}

function buildShopEmbed(message, client, items) {
  const icon = message.guild.iconURL({ size: 256 });
  const sorted = [...items].sort((a, b) => Number(a.item_id) - Number(b.item_id));

  const desc =
    sorted.length > 0
      ? sorted.map(item => itemLine(client, item)).join('\n\n')
      : 'No items are available right now.';

  return buildEmbed(message, {
    title: 'Shop',
    description:
      `Use \`$buy <id>\` to purchase an item.\n\n` +
      desc,
    thumbnail: icon,
    footer: `${message.guild.name} • ${sorted.length} item(s)`,
  });
}

function buildHelpEmbed(message) {
  return buildEmbed(message, {
    title: 'Shop Help',
    description:
      `**View shop**\n` +
      `\`$shop\`\n\n` +
      `**Buy item**\n` +
      `\`$buy <id>\`\n\n` +
      `**Add item**\n` +
      `\`$shop setup <price> <cooldown> <item name>\`\n\n` +
      `**Add custom role item**\n` +
      `\`$shop custom <price> <item name>\`\n\n` +
      `**Delete item**\n` +
      `\`$shop delete <id>\`\n\n` +
      `**Notes**\n` +
      `IDs are sequential and renumber after deletion.\n` +
      `Custom roles are bought with the same shop list and use Discord role IDs for editing.`,
    thumbnail: message.guild.iconURL({ size: 256 }),
    footer: `${message.guild.name} • Shop commands`,
  });
}

module.exports = {
  name: 'shop',
  aliases: [],
  description: 'Server shop commands.',
  category: 'economy',
  usage: '$shop | $shop help | $shop setup <price> <cooldown> <name> | $shop custom <price> <name> | $shop delete <id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const sub = String(args[0] || '').toLowerCase();

    if (!sub || sub === 'help') {
      const items = listShopItems('normal', message.guild.id);
      return message.reply({ embeds: [buildShopEmbed(message, client, items)] });
    }

    if (sub === 'setup') {
      if (!canManageShop(client, message)) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Access Denied',
              description: 'Only the bot owner or server owner can set up shop items.',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      const price = parseInt(args[1], 10);
      const cooldown = parseDurationMs(args[2]);
      const name = args.slice(3).join(' ').trim();

      if (!Number.isInteger(price) || price <= 0 || cooldown == null || !name) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Setup Failed',
              description: 'Use: `$shop setup <price> <cooldown> <item name>`',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      const item = setupItem('normal', message.guild.id, {
        name,
        price,
        cooldownMs: cooldown,
      });

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Item Created',
            description:
              `**${item.item_id}.** ${item.name}\n` +
              `Price: ${money(client, item.price)}\n` +
              `Cooldown: ${formatDuration(item.cooldown_ms)}`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    if (sub === 'custom' || sub === 'customsetup') {
      if (!canManageShop(client, message)) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Access Denied',
              description: 'Only the bot owner or server owner can set up custom role items.',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      const price = parseInt(args[1], 10);
      const name = args.slice(2).join(' ').trim();

      if (!Number.isInteger(price) || price <= 0 || !name) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Setup Failed',
              description: 'Use: `$shop custom <price> <item name>`',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      const item = setupItem('normal', message.guild.id, {
        name,
        price,
        cooldownMs: 30 * 24 * 60 * 60 * 1000,
        customDurationMs: 30 * 24 * 60 * 60 * 1000,
      });

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Custom Item Created',
            description:
              `**${item.item_id}.** ${item.name}\n` +
              `Price: ${money(client, item.price)}\n` +
              `Duration: 30 days`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    if (sub === 'delete') {
      if (!canManageShop(client, message)) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Access Denied',
              description: 'Only the bot owner or server owner can delete shop items.',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      const itemId = String(args[1] || '').trim();
      if (!itemId) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Delete Failed',
              description: 'Use: `$shop delete <item id>`',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      const deleted = deleteItem('normal', message.guild.id, itemId);
      if (!deleted) {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Delete Failed',
              description: `Item **${String(itemId).padStart(2, '0')}** was not found.`,
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Item Deleted',
            description: `Deleted **${deleted.item_id}.** ${deleted.name}\nThe shop was renumbered.`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    return message.reply({
      embeds: [buildHelpEmbed(message)],
    });
  },
};