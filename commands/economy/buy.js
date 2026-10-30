const { EmbedBuilder } = require('discord.js');
const { buyItem, listShopItems, money } = require('../../handlers/shopSystem');

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
      if (typeof data.footer === 'string') {
        embed.setFooter({ text: data.footer });
      } else {
        embed.setFooter(data.footer);
      }
    }

    return embed;
  }

  const embed = new EmbedBuilder()
    .setColor(data.color || '#0f172a')
    .setTimestamp();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);

  if (data.footer) {
    if (typeof data.footer === 'string') {
      embed.setFooter({ text: data.footer });
    } else {
      embed.setFooter(data.footer);
    }
  }

  return embed;
}

module.exports = {
  name: 'buy',
  aliases: [],
  description: 'Buy a shop item.',
  category: 'economy',
  usage: '$buy <item id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.economy) {
      return message.reply('Economy is not initialized.');
    }

    const rawId = String(args[0] || '').trim();

    if (!rawId) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Purchase Failed',
            description: 'Please provide an item ID.\n\nUsage: `$buy <item id>`',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    const itemId = rawId.padStart(2, '0');

    const item = listShopItems('normal', message.guild.id)
      .find(i => String(i.item_id) === itemId);

    if (!item) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Item Not Found',
            description: `No shop item with ID **${rawId}** exists.`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    // Check the user's balance before attempting the purchase.
    const balance = client.economy.getBalance(
      message.guild.id,
      message.author.id
    );

    const price = Number(item.price || 0);

    if (balance < price) {
      const needed = price - balance;

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Insufficient Crowns',
            description:
              `You don't have enough Crowns to purchase **${item.name}**.\n\n` +
              `**Item Price**\n${money(client, price)}\n\n` +
              `**Your Balance**\n${money(client, balance)}\n\n` +
              `**Crowns Needed**\n${money(client, needed)}`,
            thumbnail: message.guild.iconURL({ size: 256 }),
            footer: 'Earn more Crowns and try again.',
            color: '#b91c1c',
          }),
        ],
      });
    }

    const result = await buyItem(
      'normal',
      client,
      message.guild,
      message.author,
      itemId
    );

    if (!result.ok) {
      if (result.reason === 'cooldown') {
        const remaining = client.shopSystem?.formatDuration
          ? client.shopSystem.formatDuration(result.remaining)
          : `${Math.ceil(result.remaining / 1000)}s`;

        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Item on Cooldown',
              description:
                `You must wait **${remaining}** before buying **${item.name}** again.`,
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      if (result.reason === 'already_has_custom') {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Custom Role Already Owned',
              description:
                'You already have an active custom role.\n\n' +
                'Wait for it to expire before purchasing another one.',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      if (result.reason === 'role_create_failed') {
        return message.reply({
          embeds: [
            buildEmbed(message, {
              title: 'Purchase Failed',
              description:
                'Discord could not create your custom role.\n' +
                'Your Crowns have been refunded. Please try again later.',
              thumbnail: message.guild.iconURL({ size: 256 }),
            }),
          ],
        });
      }

      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Purchase Failed',
            description:
              'Your purchase could not be completed. Your balance may have changed, ' +
              'or the item may no longer be available.',
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    if (result.purchasedCustomRole) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Purchase Complete',
            description:
              `You purchased **${result.item.name}** for **${money(client, result.item.price)}**.\n\n` +
              `A custom role has been created and assigned to you.\n\n` +
              '**Customize your role**\n' +
              '`$customrename <role_id> <new name>`\n' +
              '`$customhex <role_id> #hex`\n' +
              '`$customicon <role_id>`',
            thumbnail: message.guild.iconURL({ size: 256 }),
            footer: 'Your custom role lasts 30 days.',
            color: '#16a34a',
          }),
        ],
      });
    }

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Purchase Complete',
          description:
            `You purchased **${result.item.name}** for **${money(client, result.item.price)}**.`,
          thumbnail: message.guild.iconURL({ size: 256 }),
          footer: 'The item has been added to your inventory.',
          color: '#16a34a',
        }),
      ],
    });
  },
};