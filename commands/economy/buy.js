const { EmbedBuilder } = require('discord.js');
const { buyItem, listShopItems, money } = require('../../handlers/shopSystem');

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder()
    .setColor(data.color || '#FF69B4')
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

function errorEmbed(message, title, description) {
  return buildEmbed(message, {
    color: '#ED4245',
    title,
    description,
    thumbnail: message.guild.iconURL({ size: 256 }),
  });
}

module.exports = {
  name: 'buy',
  aliases: [],
  description: 'Buy a shop item.',
  category: 'economy',
  usage: '$buy <item id>',

  async execute(client, message, args) {
    if (!message.guild) return;
    if (!client.economy) return message.reply('Economy is not initialized.');

    const rawId = String(args[0] || '').trim();
    if (!rawId) return message.reply('Use: `$buy <item id>`');

    const itemId = rawId.padStart(2, '0');

    const item = listShopItems('normal', message.guild.id).find(
      i => String(i.item_id) === itemId
    );
    if (!item) {
      return message.reply({
        embeds: [
          errorEmbed(message, 'Item Not Found', `There is no item with ID **${itemId}** in the shop.`),
        ],
      });
    }

    // Pre-check balance so we can show a clean "not enough crowns" embed
    const price = Number(item.price || 0);
    const balance = Number(client.economy.getBalance(message.guild.id, message.author.id) || 0);

    if (balance < price) {
      return message.reply({
        embeds: [
          errorEmbed(
            message,
            'Insufficient Crowns',
            `You need **${money(client, price)}** to buy **${item.name}**.\n\n` +
              `Your balance: **${money(client, balance)}**\n` +
              `You're short by: **${money(client, price - balance)}**`
          ),
        ],
      });
    }

    const result = await buyItem('normal', client, message.guild, message.author, itemId);

    if (!result.ok) {
      if (result.reason === 'no_money') {
        // Fallback in case balance changed between the check and the purchase
        return message.reply({
          embeds: [
            errorEmbed(
              message,
              'Insufficient Crowns',
              `You don't have enough Crowns to buy **${item.name}**.`
            ),
          ],
        });
      }

      if (result.reason === 'cooldown') {
        return message.reply({
          embeds: [
            errorEmbed(
              message,
              'On Cooldown',
              `You can buy **${item.name}** again in **${Math.ceil(result.remaining / 1000)}s**.`
            ),
          ],
        });
      }

      if (result.reason === 'already_has_custom') {
        return message.reply({
          embeds: [
            errorEmbed(
              message,
              'Already Owned',
              'You already have a custom role. Let that one expire or get deleted first.\nYou were not charged.'
            ),
          ],
        });
      }

      if (result.reason === 'role_create_failed') {
        return message.reply({
          embeds: [
            errorEmbed(
              message,
              'Role Creation Failed',
              'I could not create the role (check my **Manage Roles** permission). You were refunded.'
            ),
          ],
        });
      }

      return message.reply({
        embeds: [errorEmbed(message, 'Purchase Failed', 'You could not buy that item.')],
      });
    }

    if (result.purchasedCustomRole) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Purchase Complete',
            description:
              `You bought **${result.item.name}** for **${money(client, result.item.price)}**.\n\n` +
              `A role named **Custom Role** was created and given to you.\n` +
              `Role ID: \`${result.role.id}\`\n\n` +
              `**Manage it with:**\n` +
              `\`$customrename <role_id> <new name>\`\n` +
              `\`$customhex <role_id> #hex\`\n` +
              `\`$customicon <role_id>\` (attach an image)`,
            thumbnail: message.guild.iconURL({ size: 256 }),
          }),
        ],
      });
    }

    return message.reply({
      embeds: [
        buildEmbed(message, {
          title: 'Purchase Complete',
          description: `You bought **${result.item.name}** for **${money(client, result.item.price)}**.`,
          thumbnail: message.guild.iconURL({ size: 256 }),
        }),
      ],
    });
  },
};
