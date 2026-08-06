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
  name: 'buy',
  aliases: [],
  description: 'Buy a shop item.',
  category: 'economy',
  usage: '$buy <item id>',

  async execute(client, message, args) {
    if (!message.guild) return;
    if (!client.economy) return message.reply('Economy is not initialized.');

    const itemId = String(args[0] || '').padStart(2, '0');
    if (!itemId.trim()) return message.reply('Use: `$buy <item id>`');

    const item = listShopItems('normal', message.guild.id).find(i => String(i.item_id) === itemId);
    if (!item) return message.reply('That item does not exist.');

    const result = await buyItem('normal', client, message.guild, message.author, itemId);

    if (!result.ok) {
      if (result.reason === 'cooldown') {
        return message.reply(`That item is on cooldown for **${Math.ceil(result.remaining / 1000)}s**.`);
      }
      if (result.reason === 'already_has_custom') {
        return message.reply('You already have a custom role. Let that one expire or get deleted first.');
      }
      return message.reply('You could not buy that item.');
    }

    if (result.purchasedCustomRole) {
      return message.reply({
        embeds: [
          buildEmbed(message, {
            title: 'Purchase Complete',
            description:
              `You bought **${result.item.name}** for **${money(client, result.item.price)}**.\n\n` +
              `A role named **Custom Role** was created and given to you.\n` +
              `Use \`$customrename <role_id> <new name>\`, \`$customhex <role_id> #hex\`, or \`$customicon <role_id>\` to manage it.`,
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