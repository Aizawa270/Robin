
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

const RARITIES = Object.freeze(['common', 'rare', 'mythical']);

const TITLES = Object.freeze({
  common: 'Common Pokémon Pack',
  rare: 'Rare Pokémon Pack',
  mythical: 'Mythical Pokémon Pack',
});

const THEME = 0x3B82F6;
const ERROR = 0xED4245;
const WARNING = 0xF59E0B;

function buildEmbed(data = {}) {
  const embed = new EmbedBuilder()
    .setColor(data.color ?? THEME)
    .setTimestamp();

  if (data.title) embed.setTitle(data.title);
  if (data.description) embed.setDescription(data.description);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) embed.setFooter({ text: data.footer });

  return embed;
}

function guildThumbnail(message) {
  return message.guild?.iconURL?.({ size: 256 }) || null;
}

function itemLine(client, guildId, item) {
  const mapped = pokemon.getShopProduct(guildId, item.item_id);
  const packType = mapped?.pack_type;

  const label = packType
    ? `${TITLES[packType] || 'Pokémon Pack'} · Pokémon pack`
    : item.name;

  return [
    `**${item.item_id}** · **${label}**`,
    `Price per pack: **${money(client, item.price)}**`,
    `Purchase cooldown: **${formatDuration(Number(item.cooldown_ms || 0))}**`,
  ].join('\n');
}

async function setupPack(client, message, args) {
  if (!canManageShop(client, message)) {
    return message.reply({
      embeds: [buildEmbed({
        color: ERROR,
        title: 'Access Denied',
        description: 'Only the bot owner or server owner can configure EC shop products.',
        thumbnail: guildThumbnail(message),
      })],
    });
  }

  const type = String(args[1] || '').toLowerCase();
  const price = Math.floor(Number(args[2]));
  const cooldownInput = args[3] == null ? '0' : String(args[3]);
  const cooldownMs = parseDurationMs(cooldownInput);

  if (
    !RARITIES.includes(type) ||
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    cooldownMs == null
  ) {
    return message.reply({
      embeds: [buildEmbed({
        color: ERROR,
        title: 'Setup Failed',
        description: [
          'Use: `$ecshop setup <common|rare|mythical> <price per pack> [cooldown]`',
          'Example: `$ecshop setup common 2500 0`',
          'Cooldown formats: `0`, `30s`, `5m`, `2h`, `1d`.',
        ].join('\n'),
        thumbnail: guildThumbnail(message),
      })],
    });
  }

  const existing = pokemon.getShopProductByType(
    message.guild.id,
    type
  );

  if (existing) {
    return message.reply({
      embeds: [buildEmbed({
        color: WARNING,
        title: 'Pack Already Configured',
        description: `The ${type} pack is already EC shop item **${existing.item_id}**. Delete that item before creating it again.`,
        thumbnail: guildThumbnail(message),
      })],
    });
  }

  const item = setupItem('ec', message.guild.id, {
    name: TITLES[type],
    price,
    cooldownMs,
  });

  try {
    const mapped = pokemon.setupShopProduct(
      message.guild.id,
      item.item_id,
      type
    );

    if (!mapped) {
      throw new Error('The Pokémon pack mapping could not be created.');
    }
  } catch (error) {
    try {
      deleteItem('ec', message.guild.id, item.item_id);
    } catch (deleteError) {
      console.error(
        '[Pokémon EC Shop] Could not roll back failed item setup:',
        deleteError
      );
    }

    console.error('[Pokémon EC Shop] Product mapping failed:', error);

    return message.reply({
      embeds: [buildEmbed({
        color: ERROR,
        title: 'Setup Failed',
        description: 'The EC shop item could not be linked to its Pokémon pack. No usable product was created.',
        thumbnail: guildThumbnail(message),
      })],
    });
  }

  return message.reply({
    embeds: [buildEmbed({
      title: 'Pokémon Pack Added',
      description: [
        `**${item.item_id}. ${item.name}**`,
        `Price per pack: **${money(client, item.price)}**`,
        `Purchase cooldown: **${formatDuration(item.cooldown_ms)}**`,
        '',
        `Buy one with \`$ecbuy ${item.item_id}\``,
        `Buy multiple with \`$ecbuy ${item.item_id} 10\`.`,
      ].join('\n'),
      thumbnail: guildThumbnail(message),
    })],
  });
}

async function deletePack(client, message, args) {
  if (!canManageShop(client, message)) {
    return message.reply({
      embeds: [buildEmbed({
        color: ERROR,
        title: 'Access Denied',
        description: 'Only the bot owner or server owner can delete EC shop products.',
        thumbnail: guildThumbnail(message),
      })],
    });
  }

  const rawId = String(args[1] || '').trim();

  if (!rawId) {
    return message.reply('Use `$ecshop delete <item ID>`.');
  }

  const oldItems = listShopItems('ec', message.guild.id);

  const target = oldItems.find(item =>
    String(item.item_id) === rawId.padStart(2, '0') ||
    String(Number(item.item_id)) === String(Number(rawId))
  );

  if (!target) {
    return message.reply({
      embeds: [buildEmbed({
        color: ERROR,
        title: 'Item Not Found',
        description: `No EC shop item has ID **${rawId}**.`,
        thumbnail: guildThumbnail(message),
      })],
    });
  }

  const oldMappings = oldItems.map(item => ({
    oldId: String(item.item_id),
    packType:
      pokemon.getShopProduct(message.guild.id, item.item_id)?.pack_type || null,
  }));

  const deleted = deleteItem(
    'ec',
    message.guild.id,
    target.item_id
  );

  const remainingMappings = oldMappings.filter(
    item => item.oldId !== String(target.item_id)
  );

  const newItems = listShopItems('ec', message.guild.id);
  const mappings = [];

  for (let index = 0; index < remainingMappings.length; index++) {
    if (remainingMappings[index].packType && newItems[index]) {
      mappings.push({
        itemId: newItems[index].item_id,
        packType: remainingMappings[index].packType,
      });
    }
  }

  pokemon.replaceShopProductMappings(
    message.guild.id,
    mappings
  );

  return message.reply({
    embeds: [buildEmbed({
      title: 'EC Shop Item Deleted',
      description: `Deleted **${deleted.name}**. Remaining EC shop item IDs have been renumbered.`,
      thumbnail: guildThumbnail(message),
    })],
  });
}

module.exports = {
  name: 'ecshop',
  aliases: [],
  description: 'View and configure Pokémon packs in the Economy Shop.',
  category: 'economy',
  usage: '$ecshop | $ecshop setup <rarity> <price> [cooldown] | $ecshop delete <id>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'setup') {
      return setupPack(client, message, args);
    }

    if (sub === 'delete') {
      return deletePack(client, message, args);
    }

    if (sub === 'help') {
      return message.reply({
        embeds: [buildEmbed({
          title: 'Economy Shop · Pokémon Packs',
          description: [
            '**Browse:** `$ecshop`',
            '**Buy one:** `$ecbuy <item ID>`',
            '**Buy multiple:** `$ecbuy <item ID> <quantity>`',
            '**Add a pack:** `$ecshop setup <common|rare|mythical> <price> [cooldown]`',
            '**Delete a product:** `$ecshop delete <item ID>`',
            '',
            '**Collector Bonus**',
            'Every 10 Common Packs purchased earns **2 Mythical Packs**. Purchases count cumulatively.',
            '',
            'Only Pokémon pack products created through this setup command can be purchased with `$ecbuy`.',
          ].join('\n'),
          thumbnail: guildThumbnail(message),
        })],
      });
    }

    const items = listShopItems('ec', message.guild.id);

    const description = items.length
      ? items.map(item =>
          itemLine(client, message.guild.id, item)
        ).join('\n\n')
      : [
          'No EC shop products yet.',
          'A server owner can add packs with:',
          '`$ecshop setup common <price>`',
          '`$ecshop setup rare <price>`',
          '`$ecshop setup mythical <price>`',
        ].join('\n');

    return message.reply({
      embeds: [buildEmbed({
        title: 'Economy Shop',
        description: [
          description,
          '',
          'Buy with `$ecbuy <item ID> [quantity]`.',
          '',
          '**Common Pack Bonus:** Every 10 Common Packs purchased earns 2 Mythical Packs (cumulative).',
        ].join('\n'),
        thumbnail: guildThumbnail(message),
        footer: `${message.guild.name} • ${items.length} item(s)`,
      })],
    });
  },
};
