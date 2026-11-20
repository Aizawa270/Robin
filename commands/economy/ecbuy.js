
'use strict';

const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');

const {
  getItemById,
  money,
  getPurchaseCooldown,
  setPurchaseCooldown,
} = require('../../handlers/shopSystem');

const pokemon = require('../../handlers/pokemonService');

const LABELS = Object.freeze({
  common: 'Common Pokémon Pack',
  rare: 'Rare Pokémon Pack',
  mythical: 'Mythical Pokémon Pack',
});

const THEME = 0x3B82F6;
const ERROR = 0xED4245;
const MAX_PURCHASE_QUANTITY = 100;

function makeEmbed(title, description, color = THEME) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function parseQuantity(rawValue) {
  if (
    rawValue === undefined ||
    rawValue === null ||
    String(rawValue).trim() === ''
  ) {
    return { ok: true, quantity: 1 };
  }

  const raw = String(rawValue).trim();

  if (!/^\d+$/.test(raw)) {
    return { ok: false };
  }

  const quantity = Number(raw);

  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_PURCHASE_QUANTITY
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    quantity,
  };
}

function createPurchaseId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
}

module.exports = {
  name: 'ecbuy',
  aliases: [],
  description: 'Purchase one or more Pokémon packs from the Economy Shop.',
  category: 'economy',
  usage: '$ecbuy <EC shop item ID> [quantity]',

  async execute(client, message, args) {
    if (!message.guild) return;

    if (!client.economy) {
      return message.reply({
        embeds: [
          makeEmbed(
            'Economy Unavailable',
            'The Crowns economy is not initialized. Please try again later.',
            ERROR
          ),
        ],
      });
    }

    // -----------------------------------------
    // Validate shop item and purchase quantity
    // -----------------------------------------

    const rawId = String(args[0] || '').trim();

    if (!rawId) {
      return message.reply({
        embeds: [
          makeEmbed(
            'Missing Shop Item',
            'Use `$ecbuy <item ID> [quantity]`.\nExample: `$ecbuy 01 10`.'
          ),
        ],
      });
    }

    if (args.length > 2) {
      return message.reply({
        embeds: [
          makeEmbed(
            'Too Many Arguments',
            'Use `$ecbuy <item ID> [quantity]`.\nExample: `$ecbuy 01 10`.',
            ERROR
          ),
        ],
      });
    }

    const parsedQuantity = parseQuantity(args[1]);

    if (!parsedQuantity.ok) {
      return message.reply({
        embeds: [
          makeEmbed(
            'Invalid Quantity',
            `Choose a whole number from **1** to **${MAX_PURCHASE_QUANTITY}**.`,
            ERROR
          ),
        ],
      });
    }

    const quantity = parsedQuantity.quantity;

    // -----------------------------------------
    // Find the EC shop item
    // -----------------------------------------

    const item = getItemById(
      'ec',
      message.guild.id,
      rawId
    );

    if (!item) {
      return message.reply({
        embeds: [
          makeEmbed(
            'EC Shop Item Not Found',
            `There is no Economy Shop item with ID **${rawId}**.`,
            ERROR
          ),
        ],
      });
    }

    const mapping = pokemon.getShopProduct(
      message.guild.id,
      item.item_id
    );

    if (!mapping || !LABELS[mapping.pack_type]) {
      return message.reply({
        embeds: [
          makeEmbed(
            'Not a Pokémon Pack',
            'This EC shop item is not registered as a Pokémon pack. Ask a server manager to configure a Pokémon pack product.',
            ERROR
          ),
        ],
      });
    }

    // -----------------------------------------
    // Check purchase cooldown
    // -----------------------------------------

    const now = Date.now();
    const cooldownMs = Number(item.cooldown_ms || 0);

    const lastBought = Number(
      getPurchaseCooldown(
        'ec',
        message.guild.id,
        message.author.id,
        item.item_id
      ) || 0
    );

    if (
      cooldownMs > 0 &&
      lastBought &&
      now - lastBought < cooldownMs
    ) {
      const remainingSeconds = Math.ceil(
        (cooldownMs - (now - lastBought)) / 1000
      );

      return message.reply({
        embeds: [
          makeEmbed(
            'Purchase Cooldown',
            `You can buy **${LABELS[mapping.pack_type]}** again in **${remainingSeconds} seconds**.`,
            ERROR
          ),
        ],
      });
    }

    // -----------------------------------------
    // Calculate total price
    // -----------------------------------------

    const pricePerPack = Number(item.price || 0);
    const totalPrice = pricePerPack * quantity;

    if (
      !Number.isSafeInteger(pricePerPack) ||
      pricePerPack <= 0 ||
      !Number.isSafeInteger(totalPrice) ||
      totalPrice <= 0
    ) {
      console.error(
        '[Pokémon EC Shop] Invalid configured pack price:',
        {
          itemId: item.item_id,
          price: item.price,
          quantity,
        }
      );

      return message.reply({
        embeds: [
          makeEmbed(
            'Purchase Unavailable',
            'This shop item has an invalid price configuration. Please contact a server manager.',
            ERROR
          ),
        ],
      });
    }

    // -----------------------------------------
    // Check Crowns balance
    // -----------------------------------------

    const balance = Number(
      client.economy.getBalance(
        message.guild.id,
        message.author.id
      ) || 0
    );

    if (balance < totalPrice) {
      return message.reply({
        embeds: [
          makeEmbed(
            'Insufficient Crowns',
            [
              `You need **${money(client, totalPrice)}** to buy **${quantity}x ${LABELS[mapping.pack_type]}**.`,
              '',
              `Price per pack: **${money(client, pricePerPack)}**`,
              `Your balance: **${money(client, balance)}**`,
              `You're short by: **${money(client, totalPrice - balance)}**`,
            ].join('\n'),
            ERROR
          ),
        ],
      });
    }

    // -----------------------------------------
    // Remove Crowns
    // -----------------------------------------

    const removed = client.economy.removeCrowns(
      message.guild.id,
      message.author.id,
      totalPrice,
      {
        type: 'pokemon_ec_shop_purchase',
        reason: `Bought ${quantity}x ${LABELS[mapping.pack_type]}`,
        actorId: message.author.id,
        timestamp: now,
      }
    );

    if (!removed) {
      return message.reply({
        embeds: [
          makeEmbed(
            'Purchase Failed',
            'Your Crowns balance changed before the purchase could complete. Please try again.',
            ERROR
          ),
        ],
      });
    }

    // -----------------------------------------
    // Deliver packs
    // -----------------------------------------

    const purchaseId = createPurchaseId();

    let credit;

    try {
      credit = pokemon.creditShopPurchase({
        purchaseId,
        guildId: message.guild.id,
        userId: message.author.id,
        itemId: item.item_id,
        packType: mapping.pack_type,
        amount: quantity,
        now,
      });

      if (!credit || !credit.ok) {
        throw new Error(
          `Pack credit failed: ${credit?.code || 'unknown_error'}`
        );
      }
    } catch (error) {
      console.error(
        '[Pokémon EC Shop] Pack credit failed; refunding Crowns:',
        error
      );

      try {
        const refunded = client.economy.addCrowns(
          message.guild.id,
          message.author.id,
          totalPrice,
          {
            type: 'pokemon_ec_shop_refund',
            reason: 'Pokémon pack delivery failed',
            actorId: message.author.id,
          }
        );

        if (!refunded) {
          console.error(
            '[Pokémon EC Shop] Refund method returned false.',
            {
              userId: message.author.id,
              totalPrice,
              purchaseId,
            }
          );
        }
      } catch (refundError) {
        console.error(
          '[Pokémon EC Shop] CRITICAL: Could not refund failed purchase:',
          refundError
        );
      }

      return message.reply({
        embeds: [
          makeEmbed(
            'Purchase Refunded',
            'The packs could not be delivered. Your Crowns refund was attempted. Please contact a server manager if your balance was not restored.',
            ERROR
          ),
        ],
      });
    }

    // -----------------------------------------
    // Save purchase cooldown
    // -----------------------------------------

    // The packs have already been delivered.
    // A cooldown save failure must not remove them.

    try {
      setPurchaseCooldown(
        'ec',
        message.guild.id,
        message.author.id,
        item.item_id,
        now
      );
    } catch (error) {
      console.error(
        '[Pokémon EC Shop] Could not save purchase cooldown:',
        error
      );
    }

    // -----------------------------------------
    // Build purchase receipt
    // -----------------------------------------

    const balanceAfter = Number(
      client.economy.getBalance(
        message.guild.id,
        message.author.id
      ) || 0
    );

    const packCount = Number(
      credit.balances?.[mapping.pack_type] || 0
    );

    const bonusPacks = Math.max(
      0,
      Math.floor(Number(credit.bonusPacks) || 0)
    );

    const lines = [
      `You purchased **${quantity}x ${LABELS[mapping.pack_type]}**.`,
      '',
      `Price per pack: **${money(client, pricePerPack)}**`,
      `Total paid: **${money(client, totalPrice)}**`,
      '',
      `Your ${mapping.pack_type} pack balance: **${packCount}**`,
    ];

    // -----------------------------------------
    // Common Pack Collector Bonus
    // -----------------------------------------

    if (bonusPacks > 0) {
      const mythicalBalance = Number(
        credit.balances?.mythical || 0
      );

      lines.push(
        '',
        '**Collector Bonus Unlocked!**',
        `You received **${bonusPacks}x Mythical Pack(s)** for reaching a Common Pack purchase milestone.`,
        `Your Mythical pack balance: **${mythicalBalance}**`
      );
    } else if (mapping.pack_type === 'common') {
      lines.push(
        '',
        'Every **10 Common Packs purchased** earns **2 Mythical Packs**.',
        'Your Common Pack purchases count cumulatively.'
      );
    }

    lines.push(
      '',
      `Remaining Crowns: **${money(client, balanceAfter)}**`,
      '',
      `Open your pack with \`$p pack ${mapping.pack_type}\`.`
    );

    return message.reply({
      embeds: [
        makeEmbed(
          'Pokémon Pack Purchase Complete',
          lines.join('\n')
        ),
      ],
    });
  },
};
