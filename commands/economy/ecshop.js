'use strict';

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
const pokemon = require('../../handlers/pokemonService');

const RARITIES = ['common', 'rare', 'mythical'];
const TITLES = { common: 'Common Pokémon Pack', rare: 'Rare Pokémon Pack', mythical: 'Mythical Pokémon Pack' };

function buildEmbed(message, data = {}) {
  const embed = new EmbedBuilder().setColor(data.color || '#FF69B4').setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) embed.setFooter({ text: data.footer });
  return embed;
}

function itemLine(client, guildId, item) {
  const mapped = pokemon.getShopProduct(guildId, item.item_id);
  const packType = mapped?.pack_type;
  const label = packType ? `${TITLES[packType]} · Pokémon pack` : item.name;
  return `**${item.item_id}** • ${label}\nPrice: ${money(client, item.price)}\nPurchase cooldown: ${formatDuration(Number(item.cooldown_ms || 0))}`;
}

async function setupPack(client, message, args) {
  if (!canManageShop(client, message)) {
    return message.reply({ embeds: [buildEmbed(message, { color: '#ED4245', title: 'Access Denied', description: 'Only the bot owner or server owner can configure EC shop products.', thumbnail: message.guild.iconURL({ size: 256 }) })] });
  }

  const type = String(args[1] || '').toLowerCase();
  const price = Math.floor(Number(args[2]));
  const cooldownInput = args[3] == null ? '0' : String(args[3]);
  const cooldownMs = parseDurationMs(cooldownInput);
  if (!RARITIES.includes(type) || !Number.isSafeInteger(price) || price <= 0 || cooldownMs == null) {
    return message.reply({ embeds: [buildEmbed(message, { color: '#ED4245', title: 'Setup Failed', description: 'Use: `$ecshop setup <common|rare|mythical> <price> [cooldown]`\nExample: `$ecshop setup common 2500 0`\nCooldown formats: `0`, `30s`, `5m`, `2h`, `1d`.', thumbnail: message.guild.iconURL({ size: 256 }) })] });
  }
  const existing = pokemon.getShopProductByType(message.guild.id, type);
  if (existing) {
    return message.reply({ embeds: [buildEmbed(message, { color: '#F59E0B', title: 'Pack Already Configured', description: `The ${type} pack is already EC shop item **${existing.item_id}**. Delete that item before creating it again.`, thumbnail: message.guild.iconURL({ size: 256 }) })] });
  }

  const item = setupItem('ec', message.guild.id, {
    name: TITLES[type],
    price,
    cooldownMs,
  });
  try {
    pokemon.setupShopProduct(message.guild.id, item.item_id, type);
  } catch (error) {
    // If mapping creation fails, remove the just-created EC item so the shop
    // cannot display a Pokémon product that the purchase command cannot grant.
    deleteItem('ec', message.guild.id, item.item_id);
    console.error('[Pokémon EC Shop] Product mapping failed:', error);
    return message.reply({ embeds: [buildEmbed(message, { color: '#ED4245', title: 'Setup Failed', description: 'The EC shop item could not be linked to its Pokémon pack.', thumbnail: message.guild.iconURL({ size: 256 }) })] });
  }

  return message.reply({ embeds: [buildEmbed(message, {
    title: 'Pokémon Pack Added to EC Shop',
    description: `**${item.item_id}. ${item.name}**\nPrice: ${money(client, item.price)}\nPurchase cooldown: ${formatDuration(item.cooldown_ms)}\n\nPlayers can purchase it with \`$ecbuy ${item.item_id}\`.`,
    thumbnail: message.guild.iconURL({ size: 256 }),
  })] });
}

async function deletePack(client, message, args) {
  if (!canManageShop(client, message)) {
    return message.reply({ embeds: [buildEmbed(message, { color: '#ED4245', title: 'Access Denied', description: 'Only the bot owner or server owner can delete EC shop products.', thumbnail: message.guild.iconURL({ size: 256 }) })] });
  }
  const rawId = String(args[1] || '').trim();
  if (!rawId) return message.reply('Use `$ecshop delete <item ID>`.');
  const oldItems = listShopItems('ec', message.guild.id);
  const target = oldItems.find(item => String(item.item_id) === rawId.padStart(2, '0') || String(Number(item.item_id)) === String(Number(rawId)));
  if (!target) return message.reply({ embeds: [buildEmbed(message, { color: '#ED4245', title: 'Item Not Found', description: `No EC shop item has ID **${rawId}**.` })] });

  const oldMappings = oldItems.map(item => ({ oldId: String(item.item_id), packType: pokemon.getShopProduct(message.guild.id, item.item_id)?.pack_type || null }));
  const deleted = deleteItem('ec', message.guild.id, target.item_id);
  const remainingMappings = oldMappings.filter(item => item.oldId !== String(target.item_id));
  const newItems = listShopItems('ec', message.guild.id);
  const mappings = [];
  for (let i = 0; i < remainingMappings.length; i++) {
    if (remainingMappings[i].packType && newItems[i]) {
      mappings.push({ itemId: newItems[i].item_id, packType: remainingMappings[i].packType });
    }
  }
  pokemon.replaceShopProductMappings(message.guild.id, mappings);
  return message.reply({ embeds: [buildEmbed(message, { title: 'EC Shop Item Deleted', description: `Deleted **${deleted.name}**. Remaining EC shop item IDs have been renumbered.`, thumbnail: message.guild.iconURL({ size: 256 }) })] });
}

module.exports = {
  name: 'ecshop',
  aliases: [],
  description: 'View and configure the Economy Shop Pokémon packs.',
  category: 'economy',
  usage: '$ecshop | $ecshop setup <rarity> <price> [cooldown] | $ecshop delete <id>',

  async execute(client, message, args) {
    if (!message.guild) return;
    const sub = String(args[0] || '').toLowerCase();
    if (sub === 'setup') return setupPack(client, message, args);
    if (sub === 'delete') return deletePack(client, message, args);
    if (sub === 'help') {
      return message.reply({ embeds: [buildEmbed(message, {
        title: 'Economy Shop Help',
        description: '**View:** `$ecshop`\n**Buy Pokémon pack:** `$ecbuy <item ID>`\n**Add pack:** `$ecshop setup <common|rare|mythical> <price> [cooldown]`\n**Delete product:** `$ecshop delete <item ID>`\n\nOnly Pokémon pack products created through this setup command can be purchased with `$ecbuy`.',
        thumbnail: message.guild.iconURL({ size: 256 }),
      })] });
    }

    const items = listShopItems('ec', message.guild.id);
    const description = items.length
      ? items.map(item => itemLine(client, message.guild.id, item)).join('\n\n')
      : 'No EC shop products yet. A server owner can add packs with `$ecshop setup common <price>`, `$ecshop setup rare <price>` or `$ecshop setup mythical <price>`.';
    return message.reply({ embeds: [buildEmbed(message, {
      title: 'Economy Shop',
      description: `${description}\n\nUse \`$ecbuy <item ID>\` to purchase Pokémon packs.`,
      thumbnail: message.guild.iconURL({ size: 256 }),
      footer: `${message.guild.name} • ${items.length} item(s)`,
    })] });
  },
};
