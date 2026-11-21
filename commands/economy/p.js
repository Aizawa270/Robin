'use strict';

const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const pokemon = require('../../handlers/pokemonService');
const api = require('../../handlers/pokemonApi');
const economy = require('../../handlers/economy');
const features = require('../../handlers/pokemonFeatures')(pokemon);
const {
  buildCardEmbed,
  buildPackButtons,
  buildCollectionSummary,
  buildCollectionGallery,
  buildBrowseButtons,
  buildFilteredInventoryButtons,
  buildResetButtons,
  buildInventoryEmbed,
  buildPokedexEmbed,
  buildProfileEmbed,
  buildProfileImage,
  buildSimpleEmbed,
  rarityInfo,
} = require('../../handlers/pokemonEmbeds');
const { canManageShop } = require('../../handlers/shopSystem');
const { emoji } = require('../../handlers/pokemonEmojis');

const THEME = '#3B82F6';
const FILTERED_INVENTORY_SESSIONS = new Map();
const RESET_SESSIONS = new Map();

function cleanArgs(args = []) {
  return args.filter(value => !/^<@!?\d+>$/.test(String(value)));
}

function mentionUser(message) {
  return message.mentions?.users?.first?.() || null;
}

function canManage(message) {
  return canManageShop(null, message) || Boolean(message.member?.permissions?.has?.('ManageGuild'));
}

function rarityName(value) {
  return pokemon.CARD_RARITY[value]?.label || value;
}

function error(message, title, description) {
  return message.reply({ embeds: [buildSimpleEmbed(title, description, 0xED4245)] });
}

function formatPackBalances(balances) {
  return [
    `${emoji('pack_common')} **${balances.common}x** Common Packs`,
    `${emoji('pack_rare')} **${balances.rare}x** Rare Packs`,
    `${emoji('pack_mythical')} **${balances.mythical}x** Mythical Packs`,
  ].join('\n');
}

function attachFeatureInteractions(client) {
  if (!client || client._pokemonFeatureInteractionsAttached) return;
  client._pokemonFeatureInteractionsAttached = true;

  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const customId = String(interaction.customId || '');

    if (customId.startsWith('pokemon:reset:')) {
      const [, , token, action] = customId.split(':');
      const session = RESET_SESSIONS.get(token);
      if (!session || session.expiresAt <= Date.now()) {
        RESET_SESSIONS.delete(token);
        return interaction.reply({ content: 'This reset confirmation expired. Run `$p reset` again.', ephemeral: true }).catch(() => {});
      }
      if (String(interaction.user.id) !== session.userId || String(interaction.guildId || '') !== session.guildId) {
        return interaction.reply({ content: 'Only the player who requested this reset can use these buttons.', ephemeral: true }).catch(() => {});
      }

      RESET_SESSIONS.delete(token);
      if (action === 'cancel') {
        return interaction.update({
          embeds: [buildSimpleEmbed('Reset cancelled', 'Your Pokémon cards, packs and progress have not been changed.')],
          components: [],
        }).catch(() => {});
      }
      if (action !== 'confirm') {
        return interaction.reply({ content: 'That reset action is not valid.', ephemeral: true }).catch(() => {});
      }

      try {
        const result = features.resetPlayerData(session.guildId, session.userId);
        return interaction.update({
          embeds: [buildSimpleEmbed(
            'Pokémon data reset',
            result.ok
              ? 'Your Pokémon data in this server has been reset. Your cards, packs, collections, Pokédex discoveries, quests, wishlist were cleared. The receipt ledger, shared Pokémon data and shop setup were kept to protect purchase idempotency.'
              : 'The reset could not be completed.',
            result.ok ? 0x16A34A : 0xED4245
          )],
          components: [],
        }).catch(() => {});
      } catch (resetError) {
        console.error('[Pokémon] Player reset failed:', resetError);
        return interaction.update({
          embeds: [buildSimpleEmbed('Reset failed', 'Something went wrong while resetting your Pokémon data. No success was reported.', 0xED4245)],
          components: [],
        }).catch(() => {});
      }
    }

    if (!customId.startsWith('pokemon:invfilter:')) return;
    const [, , sessionId, action] = customId.split(':');
    const session = FILTERED_INVENTORY_SESSIONS.get(sessionId);

    if (!session || session.expiresAt <= Date.now()) {
      FILTERED_INVENTORY_SESSIONS.delete(sessionId);
      return interaction.reply({ content: 'This inventory page expired. Run `$p inv` again.', ephemeral: true }).catch(() => {});
    }
    if (String(interaction.user.id) !== session.requesterId || String(interaction.guildId || '') !== session.guildId) {
      return interaction.reply({ content: 'Only the player who opened this inventory can use its page buttons.', ephemeral: true }).catch(() => {});
    }
    if (!['first', 'prev', 'next', 'last'].includes(action)) {
      return interaction.reply({ content: 'That inventory action is not valid.', ephemeral: true }).catch(() => {});
    }

    try {
      const firstPage = features.getInventoryAdvanced(session.guildId, session.targetId, {
        ...session.filters,
        page: 1,
        limit: session.limit,
      });
      const pages = Math.max(1, firstPage.pages);
      if (action === 'first') session.page = 1;
      else if (action === 'last') session.page = pages;
      else if (action === 'prev') session.page = Math.max(1, session.page - 1);
      else if (action === 'next') session.page = Math.min(pages, session.page + 1);
      session.page = Math.max(1, Math.min(pages, session.page));

      const result = session.page === 1
        ? firstPage
        : features.getInventoryAdvanced(session.guildId, session.targetId, {
            ...session.filters,
            page: session.page,
            limit: session.limit,
          });
      session.expiresAt = Date.now() + 5 * 60 * 1000;

      return interaction.update({
        embeds: [buildInventoryEmbed(result, session.title, session.filters.rarity, session.avatarURL, session.filters)],
        components: [buildFilteredInventoryButtons(sessionId, result.page, result.pages)],
      }).catch(() => {});
    } catch (browseError) {
      console.error('[Pokémon] Filtered inventory pagination failed:', browseError);
      return interaction.reply({ content: 'I could not update this inventory page. Run `$p inv` again.', ephemeral: true }).catch(() => {});
    }
  });
}

async function showHelp(message) {
  const botIcon = message.client?.user?.displayAvatarURL?.({ size: 128 });
  const embed = new EmbedBuilder()
    .setColor(THEME)
    .setAuthor({
      name: 'VANESSA  /  POKÉMON COLLECTION',
      ...(botIcon ? { iconURL: botIcon } : {}),
    })
    .setTitle('Pokémon Field Guide')
    .setDescription([
      'Collect cards, discover Pokémon across **Generations I–IX**, and build your own collection.',
      '',
      '**Start here**  ·  `$p packs` to check your balance  ·  `$p pack common` to open a pack.',
    ].join('\n'))
    .addFields(
      {
        name: '01  /  PACKS',
        value: [
          '`$p packs` — View pack balance',
          '`$p pack <rarity>` — Open a pack',
          '`$p pack <rarity> all` — Show all ten cards',
          '`$p daily` — Claim daily reward',
        ].join('\n'),
        inline: true,
      },
      {
        name: '02  /  INVENTORY',
        value: [
          '`$p inv` — View your cards',
          '`$p inv psychic` — Filter by type',
          '`$p inv shiny` — Show shiny cards',
          '`$p inv gen 4` — Filter by generation',
          '`$p inv rare gen 2` — Combine filters',
          '`$p view <card ID>` — Inspect a card',
          '`$p whohas <Pokémon>` — Find its owners',
        ].join('\n'),
        inline: true,
      },
      {
        name: '03  /  WISHLIST',
        value: [
          '`$p wishlist` — View yours',
          '`$p wishlist @user` — View another wishlist',
          '`$p wishlist add <Pokémon>`',
          '`$p wishlist remove <Pokémon>`',
        ].join('\n'),
        inline: true,
      },
      {
        name: '04  /  COLLECTIONS',
        value: [
          '`$p create collection <name>`',
          '`$p collections [@user]`',
          '`$p display [@user] <name>`',
          '`$p add <card ID> <name>`',
          '`$p remove <card ID> <name>`',
          '`$p sethex <name> <hex>`',
          '`$p delete collection <name>`',
        ].join('\n'),
        inline: true,
      },
      {
        name: '05  /  POKÉDEX & PROGRESS',
        value: [
          '`$p pokedex [gen1-gen9] [page]`',
          '`$p stats [@user]` / `$p profile [@user]` — Collector profile',
          '`$p quests`  ·  `$p claim <quest ID>`',
          '`$p leaderboard [cards|mythical|unique|collections]`',
        ].join('\n'),
        inline: true,
      },
      {
        name: '06  /  CARD MANAGEMENT',
        value: [
          '`$p gift @user <card IDs>`',
          '`$p burn <card IDs>`',
          '`$p reset` — Reset your data after confirmation',
        ].join('\n'),
        inline: true,
      },
      {
        name: 'EC SHOP',
        value: '`$ecshop` — Browse available items\n`$ecbuy <item ID> [quantity]` — Buy packs (quantity support depends on the EC buy command integration)',
        inline: false,
      },
    )
    .setFooter({
      text: `${message.guild?.name || 'This server'}  ·  Pokémon data is saved separately in each server.`,
    });

  return message.reply({ embeds: [embed] });
}

async function commandPacks(message) {
  const balances = pokemon.getPackBalances(message.guild.id, message.author.id);
  const embed = buildSimpleEmbed('Your Pokémon Packs', formatPackBalances(balances))
    .setThumbnail(message.author.displayAvatarURL({ size: 256 }));
  return message.reply({ embeds: [embed] });
}

async function commandUnpack(message, args) {
  const rawRarity = String(args[0] || '').toLowerCase();
  const rarity = rawRarity === 'mythic' ? 'mythical' : rawRarity;
  const showAll = args.slice(1).some(value => ['10', 'all'].includes(String(value).toLowerCase()));
  if (!pokemon.PACK_TYPES.includes(rarity)) {
    return error(message, 'Choose a pack', 'Use `$p pack common`, `$p pack rare` or `$p pack mythical`. Add `all` to display all ten cards at once.');
  }

  const result = pokemon.openPack(message.guild.id, message.author.id, rarity);
  if (!result.ok) {
    if (result.code === 'no_packs') return error(message, 'No packs available', `You do not own a ${rarity} pack. Check **$p packs** or visit **$ecshop**.`);
    if (result.code === 'already_opening') return error(message, 'Pack already opening', 'Finish your current pack display first.');
    if (result.code === 'cooldown') return error(message, 'Pack cooldown', `You can open another pack in **${(result.remaining / 1000).toFixed(1)} seconds**.`);
    if (result.code === 'species_not_synced') return error(message, 'Pokémon data not ready', 'A server manager needs to run `$p setup sync` first.');
    return error(message, 'Could not open pack', 'Please try again.');
  }

  const packMessage = `**${message.author.username}** opened a **${rarityName(rarity)} Pack**. All 10 cards have been added to the inventory.`;
  if (showAll) {
    return message.reply({
      content: `${packMessage}\nShowing all ten cards below.`,
      embeds: result.cards.map((card, index) => buildCardEmbed(card, index, result.cards.length, result.counts)),
      allowedMentions: { repliedUser: false, parse: [] },
    });
  }

  const sessionId = pokemon.createPackSession(message.guild.id, message.author.id, result.cards, result.counts);
  return message.reply({
    content: `${packMessage}\nUse the arrows to browse your cards.`,
    embeds: [buildCardEmbed(result.cards[0], 0, result.cards.length, result.counts)],
    components: [buildPackButtons(sessionId)],
    allowedMentions: { repliedUser: false, parse: [] },
  });
}

function parseInventoryArgs(args) {
  const tokens = cleanArgs(args).map(value => String(value));
  const options = { rarity: null, type: null, generation: null, shiny: false, page: 1, search: '' };
  const remaining = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].toLowerCase();
    if (token === 'shiny') {
      options.shiny = true;
      continue;
    }
    if (['common', 'rare', 'mythical', 'mythic'].includes(token) && !options.rarity) {
      options.rarity = token === 'mythic' ? 'mythical' : token;
      continue;
    }
    if (['type', 'typing'].includes(token)) {
      const next = String(tokens[i + 1] || '').toLowerCase();
      if (features.TYPES.includes(next)) {
        options.type = next;
        i++;
        continue;
      }
    }
    if (token === 'gen' || token === 'generation') {
      const next = Number(tokens[i + 1]);
      if (Number.isInteger(next) && next >= 1 && next <= 9) {
        options.generation = next;
        i++;
        continue;
      }
    }
    const compactGen = token.match(/^gen([1-9])$/);
    if (compactGen) {
      options.generation = Number(compactGen[1]);
      continue;
    }
    if (features.TYPES.includes(token) && !options.type) {
      options.type = token;
      continue;
    }
    if (/^\d+$/.test(token) && options.page === 1) {
      options.page = Math.max(1, Number(token));
      continue;
    }
    remaining.push(tokens[i]);
  }

  options.search = remaining.join(' ').trim();
  return options;
}

async function commandInventory(message, args) {
  const target = mentionUser(message) || message.author;
  const filters = parseInventoryArgs(args);
  if (filters.search && filters.search.length > 60) {
    return error(message, 'Search is too long', 'Keep Pokémon name searches under 60 characters.');
  }

  const title = target.id === message.author.id
    ? 'Your Pokémon Inventory'
    : `${target.username}'s Pokémon Inventory`;
  const avatarURL = target.displayAvatarURL({ size: 256 });
  const firstPage = features.getInventoryAdvanced(message.guild.id, target.id, {
    ...filters,
    page: 1,
    limit: 10,
  });
  const page = Math.min(filters.page, firstPage.pages);
  const result = page === 1
    ? firstPage
    : features.getInventoryAdvanced(message.guild.id, target.id, {
        ...filters,
        page,
        limit: 10,
      });

  const embed = buildInventoryEmbed(result, title, filters.rarity, avatarURL, filters);
  const components = [];
  if (result.pages > 1) {
    const sessionId = crypto.randomBytes(5).toString('hex');
    FILTERED_INVENTORY_SESSIONS.set(sessionId, {
      requesterId: String(message.author.id),
      targetId: String(target.id),
      guildId: String(message.guild.id),
      title,
      avatarURL,
      filters: { ...filters },
      page: result.page,
      limit: 10,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    components.push(buildFilteredInventoryButtons(sessionId, result.page, result.pages));
  }

  return message.reply({ embeds: [embed], components });
}

function resolveSpeciesQuery(query) {
  const matches = features.findSpecies(query, 8);
  if (!matches.length) return { ok: false, code: 'not_found', matches: [] };
  const normalized = String(query || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
  const exact = matches.find(item => item.name.toLowerCase() === normalized);
  if (exact) return { ok: true, species: exact, matches };
  if (matches.length === 1) return { ok: true, species: matches[0], matches };
  return { ok: false, code: 'ambiguous', matches };
}

function formatSpeciesMatches(matches) {
  return matches.slice(0, 8).map(item => `• **${item.name}**  ·  Gen ${item.generation}`).join('\n');
}

async function commandWhoHas(message, args) {
  const query = cleanArgs(args).join(' ').trim();
  if (!query) return error(message, 'Missing Pokémon', 'Use `$p whohas <Pokémon name>`.');
  const resolved = resolveSpeciesQuery(query);
  if (!resolved.ok) {
    if (resolved.code === 'ambiguous') {
      return message.reply({ embeds: [buildSimpleEmbed('Which Pokémon?', `I found several matches. Try a more specific name:\n\n${formatSpeciesMatches(resolved.matches)}`)] });
    }
    return error(message, 'Pokémon not found', `I could not find **${query}** in the synced species catalogue.`);
  }

  const owners = features.getWhoHas(message.guild.id, resolved.species.species_id, 15);
  if (!owners.length) {
    return message.reply({ embeds: [buildSimpleEmbed(`Who has ${resolved.species.name}?`, 'Nobody in this server has collected this Pokémon yet.')] });
  }

  const lines = [];
  for (const owner of owners) {
    const user = await message.client.users.fetch(owner.user_id).catch(() => null);
    const label = user ? `${user.username}` : `User ${owner.user_id}`;
    lines.push(`**${label}**  ·  **${owner.card_count}** card(s)\n${owner.common_count} Common  ·  ${owner.rare_count} Rare  ·  ${owner.mythical_count} Mythical`);
  }
  const totalOwners = owners.length;
  return message.reply({
    embeds: [buildSimpleEmbed(
      `Who has ${resolved.species.name}?`,
      `**Top ${totalOwners} owner(s)** in this server\n\n${lines.join('\n\n')}`
    )],
  });
}

async function commandWishlist(message, args) {
  const action = String(args[0] || '').toLowerCase();

  if (action === 'add' || action === 'remove') {
    const query = cleanArgs(args.slice(1)).join(' ').trim();
    if (!query) return error(message, 'Missing Pokémon', `Use \`$p wishlist ${action} <Pokémon name>\`.`);
    const resolved = resolveSpeciesQuery(query);
    if (!resolved.ok) {
      if (resolved.code === 'ambiguous') {
        return message.reply({ embeds: [buildSimpleEmbed('Which Pokémon?', `Please use a more specific name:\n\n${formatSpeciesMatches(resolved.matches)}`)] });
      }
      return error(message, 'Pokémon not found', `I could not find **${query}** in the synced species catalogue.`);
    }

    const result = action === 'add'
      ? features.addWishlist(message.guild.id, message.author.id, resolved.species.species_id)
      : features.removeWishlist(message.guild.id, message.author.id, resolved.species.species_id);

    if (!result.ok) {
      const text = {
        already_added: `**${resolved.species.name}** is already on your wishlist.`,
        wishlist_full: 'Your wishlist is full. The limit is 50 Pokémon.',
        not_found: `**${resolved.species.name}** is not on your wishlist.`,
      }[result.code] || 'That wishlist change could not be completed.';
      return error(message, 'Wishlist unchanged', text);
    }

    return message.reply({
      embeds: [buildSimpleEmbed(
        action === 'add' ? 'Added to wishlist' : 'Removed from wishlist',
        action === 'add'
          ? `${emoji('discovered', '●')} **${resolved.species.name}** has been added to your wishlist.`
          : `**${resolved.species.name}** has been removed from your wishlist.`
      )],
    });
  }

  const target = mentionUser(message) || message.author;
  const rows = features.getWishlist(message.guild.id, target.id);
  const title = target.id === message.author.id ? 'Your Pokémon Wishlist' : `${target.username}'s Pokémon Wishlist`;
  if (!rows.length) {
    return message.reply({ embeds: [buildSimpleEmbed(title, 'No Pokémon on this wishlist yet. Add one with `$p wishlist add <Pokémon>`.')] });
  }

  const lines = rows.map((row, index) =>
    `**${String(index + 1).padStart(2, '0')}**  ${emoji('pokemon', '◈')} **${row.name}**  ·  Gen ${row.generation}  ·  ${rarityName(row.rarity)}`
  );
  const embed = buildSimpleEmbed(title, lines.join('\n'))
    .setFooter({ text: `${rows.length}/50 Pokémon saved` })
    .setThumbnail(target.displayAvatarURL({ size: 256 }));
  return message.reply({ embeds: [embed] });
}

async function commandReset(message) {
  const token = crypto.randomBytes(6).toString('hex');
  RESET_SESSIONS.set(token, {
    guildId: String(message.guild.id),
    userId: String(message.author.id),
    expiresAt: Date.now() + 60 * 1000,
  });

  const embed = buildSimpleEmbed(
    'Reset Pokémon data?',
    'This permanently clears **your** cards, pack balances, collections, Pokédex discoveries, quests and wishlist in this server.\n\nIt does **not** delete the shared Pokémon catalogue or the server’s Pokémon shop setup.\n\nPress **Reset my Pokémon data** to confirm. This confirmation expires in 60 seconds.',
    0xED4245
  );
  return message.reply({ embeds: [embed], components: [buildResetButtons(token)] });
}

async function commandView(message, args) {
  const cardId = String(args[0] || '').trim();
  if (!cardId) return error(message, 'Missing card ID', 'Use `$p view <card ID>`.');
  const card = pokemon.getCard(message.guild.id, cardId);
  if (!card) return error(message, 'Card not found', 'That card ID does not exist in this server.');
  const embed = buildCardEmbed(card, 0, 1);
  embed.setFooter({ text: `Owned by user ${card.user_id}` });
  return message.reply({ embeds: [embed] });
}

async function commandGift(message, args) {
  const recipient = mentionUser(message);
  if (!recipient) return error(message, 'Missing recipient', 'Use `$p gift @user <card ID> [card ID ...]`.');
  const ids = cleanArgs(args).filter(value => /^[A-Za-z0-9]{6}$/.test(String(value)));
  if (!ids.length) return error(message, 'Missing card IDs', 'Provide one or more six-character card IDs.');
  const result = pokemon.giftCards(message.guild.id, message.author.id, recipient.id, ids);
  if (!result.ok) {
    if (result.code === 'self_gift') return error(message, 'Invalid recipient', 'You cannot gift cards to yourself.');
    if (result.code === 'card_not_owned') return error(message, 'Card not available', 'One or more IDs are invalid or are not in your inventory. No cards were transferred.');
    return error(message, 'Gift failed', 'Provide between 1 and 25 unique card IDs.');
  }
  return message.reply({ embeds: [buildSimpleEmbed(`${emoji('gift')}Cards gifted`, `Transferred **${result.count}** card(s) to **${recipient.username}**. Cards are removed from any collection before transfer.`)] });
}

async function commandBurn(message, args) {
  const ids = cleanArgs(args).filter(value => /^[A-Za-z0-9]{6}$/.test(String(value)));
  const result = pokemon.burnCards(message.guild.id, message.author.id, ids);
  if (!result.ok) {
    if (result.code === 'card_not_owned') return error(message, 'Card not available', 'One or more IDs are invalid or are not in your inventory. No cards were removed.');
    return error(message, 'Missing card IDs', 'Use `$p burn <card ID> [card ID ...]` with up to 25 IDs.');
  }

  const crowns = Number(result.rewardTotal || 0);
  const wallet = economy.addCrowns(message.guild.id, message.author.id, crowns, {
    type: 'pokemon_card_burn',
    reason: `Burned ${result.count} Pokémon card(s)`,
  });
  if (!wallet) {
    return error(message, 'Cards burned, payout issue', `Your **${result.count}** card(s) were removed, but the Crown payout could not be recorded. Please contact a server administrator with this message.`);
  }

  const breakdown = [
    result.burnedByRarity.common ? `Common: **${result.burnedByRarity.common}** × 1,000` : null,
    result.burnedByRarity.rare ? `Rare: **${result.burnedByRarity.rare}** × 5,000` : null,
    result.burnedByRarity.mythical ? `Mythical: **${result.burnedByRarity.mythical}** × 15,000` : null,
  ].filter(Boolean).join('\n');

  return message.reply({
    embeds: [buildSimpleEmbed(
      'Cards burned',
      `Permanently removed **${result.count}** card(s) from your inventory.\n\n${breakdown}\n\n**Crowns earned:** +${crowns.toLocaleString('en-US')} Crowns`,
      0xD6A53C
    )],
  });
}

async function commandCollections(message, args) {
  const target = mentionUser(message) || message.author;
  const rows = pokemon.listCollections(message.guild.id, target.id);
  const description = rows.length
    ? rows.map(row => `**${row.name}**  —  ${row.card_count}/8 cards`).join('\n')
    : 'No collections have been created yet.';
  const embed = buildSimpleEmbed(target.id === message.author.id ? 'Your Collections' : `${target.username}'s Collections`, description)
    .setThumbnail(target.displayAvatarURL({ size: 256 }));
  return message.reply({ embeds: [embed] });
}

async function commandDisplay(message, args) {
  const target = mentionUser(message) || message.author;
  const name = cleanArgs(args).join(' ').trim();
  if (!name) return error(message, 'Missing collection name', 'Use `$p display <collection name>` or `$p display @user <collection name>`.');
  const display = pokemon.getCollectionDisplay(message.guild.id, target.id, name);
  if (!display) return error(message, 'Collection not found', 'That player does not have a collection with that name.');

  const embed = buildCollectionSummary(display.collection, display.cards, target.username);
  try {
    const gallery = await buildCollectionGallery(display.cards, display.collection, target.username);
    if (gallery) {
      embed.setFields([]);
      embed.setImage('attachment://pokemon-collection.png');
      return message.reply({ embeds: [embed], files: [gallery] });
    }
  } catch (galleryError) {
    console.error('[Pokémon] Collection gallery generation failed:', galleryError);
  }
  return message.reply({ embeds: [embed] });
}

async function commandPokedex(message, args) {
  const rest = cleanArgs(args);
  const first = String(rest[0] || '').toLowerCase();
  const separateGeneration = first === 'gen' || first === 'generation';
  const generationToken = separateGeneration ? String(rest[1] || '') : first;
  const hasGeneration = /^gen(?:eration)?[1-9]$/.test(generationToken) || /^[1-9]$/.test(generationToken);
  const generation = hasGeneration ? Number(generationToken.replace(/\D/g, '')) : null;
  const pageToken = hasGeneration
    ? rest[separateGeneration ? 2 : 1]
    : (first === 'all' ? rest[1] : (/^\d+$/.test(first) ? first : null));
  const requestedPage = Math.max(1, Number(pageToken) || 1);

  const status = api.getSyncStatus();
  if (!status.ready) {
    return error(message, 'Pokédex not initialized', `Run **$p setup sync** first. Cached species: **${status.total}/${status.expected}**.`);
  }

  const firstPage = pokemon.getPokedex(message.guild.id, message.author.id, generation, 1, 20);
  const page = Math.min(requestedPage, firstPage.pages);
  const result = page === 1
    ? firstPage
    : pokemon.getPokedex(message.guild.id, message.author.id, generation, page, 20);
  const components = result.pages > 1
    ? [pokemon.createBrowseSession(message.guild.id, message.author.id, {
        kind: 'pokedex', targetId: message.author.id, generation, page: result.page, limit: 20,
      })].map(sessionId => buildBrowseButtons(sessionId, result.page, result.pages))
    : [];

  return message.reply({ embeds: [buildPokedexEmbed(result, generation)], components });
}

async function commandStats(client, message) {
  const target = mentionUser(message) || message.author;
  const stats = pokemon.getPlayerStats(message.guild.id, target.id);
  const packBalances = pokemon.getPackBalances(message.guild.id, target.id);
  const profileImage = await buildProfileImage(target, stats, packBalances, message.guild?.name || 'This server');
  if (profileImage) {
    const embed = buildProfileEmbed(target, stats, packBalances, message.guild?.name || 'This server')
      .setImage('attachment://pokemon-profile.png');
    return message.reply({ embeds: [embed], files: [profileImage] });
  }
  const embed = buildProfileEmbed(target, stats, packBalances, message.guild?.name || 'This server');
  return message.reply({ embeds: [embed] });
}

async function commandQuests(message) {
  const quests = pokemon.getQuests(message.guild.id, message.author.id);
  const lines = quests.map(quest => {
    const status = quest.claimed
      ? `${emoji('discovered', '●')} Claimed`
      : quest.completed
        ? `${emoji('quest_ready')} Ready to claim`
        : `${quest.progress}/${quest.target}`;
    return `**${quest.title}**  ·  \`${quest.id}\`\n${quest.description}\nProgress: **${status}**  ·  Reward: **${quest.rewardAmount}x ${rarityName(quest.rewardType)} Pack**`;
  });
  return message.reply({ embeds: [buildSimpleEmbed(`${emoji('quest')}Pokémon Quests`, `${lines.join('\n\n')}\n\nClaim completed quests with \`$p claim <quest ID>\`.`)] });
}

async function commandClaim(message, args) {
  const questId = String(args[0] || '').trim();
  if (!questId) return error(message, 'Missing quest ID', 'Use `$p claim <quest ID>`.');
  const result = pokemon.claimQuest(message.guild.id, message.author.id, questId);
  if (!result.ok) {
    const text = {
      unknown_quest: 'That quest does not exist.',
      not_complete: 'You have not completed that quest yet.',
      already_claimed: 'You have already claimed this quest reward for the current period.',
    }[result.code] || 'The reward could not be claimed.';
    return error(message, 'Quest reward unavailable', text);
  }
  return message.reply({ embeds: [buildSimpleEmbed(`${emoji('quest_ready')}Quest completed!`, `You received **${result.quest.rewardAmount}x ${rarityName(result.quest.rewardType)} Pack**.`)] });
}

async function commandDaily(message) {
  const result = pokemon.claimDaily(message.guild.id, message.author.id);
  if (!result.ok) return error(message, 'Daily reward claimed', 'You have already claimed today’s Pokémon reward. The daily reset follows UTC+6.');
  return message.reply({ embeds: [buildSimpleEmbed(`${emoji('daily')}Daily Pokémon Reward`, `You received **${result.reward.amount}x ${rarityName(result.reward.type)} Pack**!\n\n${formatPackBalances(result.balances)}`)] });
}

async function commandLeaderboard(client, message, args) {
  const type = String(args[0] || 'cards').toLowerCase();
  const allowed = ['cards', 'mythical', 'unique', 'collections'];
  if (!allowed.includes(type)) return error(message, 'Invalid leaderboard', `Choose one: ${allowed.join(', ')}.`);
  const rows = pokemon.getLeaderboard(message.guild.id, type, 10);
  const labels = { cards: 'Cards owned', mythical: 'Mythical-tier cards', unique: 'Unique Pokémon discovered', collections: 'Collections created' };
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const user = await client.users.fetch(rows[i].user_id).catch(() => null);
    lines.push(`**${i + 1}.** ${user?.username || `User ${rows[i].user_id}`}  —  **${rows[i].score}**`);
  }
  return message.reply({ embeds: [buildSimpleEmbed(`Pokémon Leaderboard  ·  ${labels[type]}`, lines.length ? lines.join('\n') : 'No leaderboard data yet.')] });
}

async function commandSetup(message, args) {
  if (!canManage(message)) return error(message, 'Access denied', 'Only the server owner, bot owner or members with Manage Server can run Pokémon setup.');
  const sub = String(args[0] || '').toLowerCase();
  if (sub !== 'sync') return error(message, 'Pokémon setup', 'Use `$p setup sync` to sync Pokémon data, or `$p setup sync force` to refresh all 1,025 species.');
  const statusMessage = await message.reply({ embeds: [buildSimpleEmbed('Pokémon data sync', 'Connecting to PokéAPI and caching species information. This is normally a one-time setup task.')] });
  try {
    const force = args.slice(1).some(value => String(value).toLowerCase() === 'force');
    const result = await api.syncSpecies({
      force,
      onProgress: progress => {
        if (progress.stage === 'species' && (progress.completed % 100 === 0 || progress.completed === progress.total)) {
          statusMessage.edit({ embeds: [buildSimpleEmbed('Pokémon data sync', `Cached **${progress.completed}/${progress.total}** species…`)] }).catch(() => {});
        }
      },
    });
    const genLines = result.byGeneration.map(row => `Gen ${row.generation}: ${row.count}`).join('\n');
    const rarityLines = result.byRarity.map(row => `${rarityName(row.rarity)}: ${row.count}`).join('\n');
    const description = `Cached **${result.totalCached}/1,025** species.\n\nReclassified **${Number(result.reclassifiedCards || 0)}** existing Ultra Beast card(s) as Mythical.\n\n**Generations**\n${genLines}\n\n**Species rarity registry**\n${rarityLines}` + (result.failures.length ? `\n\n**${result.failures.length} request(s) failed.** Run sync again to retry missing species.` : '');
    return statusMessage.edit({ embeds: [buildSimpleEmbed(result.ok ? 'Pokémon data ready' : 'Pokémon sync incomplete', description, result.ok ? 0x16A34A : 0xF59E0B)] });
  } catch (syncError) {
    console.error('[Pokémon API] Sync failed:', syncError);
    return statusMessage.edit({ embeds: [buildSimpleEmbed('Pokémon sync failed', `PokéAPI could not be reached.\n\n${String(syncError.message || syncError).slice(0, 700)}`, 0xED4245)] });
  }
}

async function commandEvent(message, args) {
  if (!canManage(message)) return error(message, 'Access denied', 'Only the server owner, bot owner or members with Manage Server can distribute event packs.');
  if (String(args[0] || '').toLowerCase() !== 'reward') return error(message, 'Event reward', 'Use `$p event reward @user <common|rare|mythical> [amount]`.');
  const target = mentionUser(message);
  const rest = cleanArgs(args).slice(1);
  const type = String(rest[0] || '').toLowerCase();
  const amount = Math.max(1, Math.min(100, Math.floor(Number(rest[1]) || 1)));
  if (!target || !pokemon.PACK_TYPES.includes(type)) return error(message, 'Invalid event reward', 'Use `$p event reward @user <common|rare|mythical> [amount]`.');
  pokemon.grantEventReward(message.guild.id, target.id, type, amount);
  return message.reply({ embeds: [buildSimpleEmbed('Event reward delivered', `Granted **${amount}x ${rarityName(type)} Pack** to **${target.username}**.`)] });
}

async function execute(client, message, args) {
  if (!message.guild) return;
  if (!Array.isArray(args) || args.length === 0) return;
  attachFeatureInteractions(client);

  const sub = String(args[0] || '').toLowerCase();
  const rest = args.slice(1);

  switch (sub) {
    case 'help': return showHelp(message);
    case 'packs': return commandPacks(message);
    case 'pack':
    case 'unpack': return commandUnpack(message, rest);
    case 'inventory':
    case 'inv': return commandInventory(message, rest);
    case 'whohas': return commandWhoHas(message, rest);
    case 'wishlist': return commandWishlist(message, rest);
    case 'reset': return commandReset(message);
    case 'view': return commandView(message, rest);
    case 'gift': return commandGift(message, rest);
    case 'burn': return commandBurn(message, rest);
    case 'collections': return commandCollections(message, rest);
    case 'create': {
      if (String(rest[0] || '').toLowerCase() !== 'collection') return error(message, 'Create command', 'Use `$p create collection <name>`.');
      const name = rest.slice(1).join(' ').trim();
      const result = pokemon.createCollection(message.guild.id, message.author.id, name);
      if (!result.ok) return error(message, 'Collection not created', result.code === 'name_exists' ? 'You already have a collection with that name.' : 'Collection names must be 1–40 characters.');
      return message.reply({ embeds: [buildSimpleEmbed('Collection created', `Created **${result.collection.name}**. Add cards with **$p add <card ID> <collection name>**.`)] });
    }
    case 'delete': {
      if (String(rest[0] || '').toLowerCase() !== 'collection') return error(message, 'Delete command', 'Use `$p delete collection <name>`.');
      const result = pokemon.deleteCollection(message.guild.id, message.author.id, rest.slice(1).join(' '));
      return result.ok
        ? message.reply({ embeds: [buildSimpleEmbed('Collection deleted', `Deleted **${result.collection.name}**. Your cards remain in your inventory.`)] })
        : error(message, 'Collection not found', 'You do not own a collection with that name.');
    }
    case 'display': return commandDisplay(message, rest);
    case 'add': {
      const cardId = String(rest[0] || '').trim();
      const name = rest.slice(1).join(' ').trim();
      const result = pokemon.addCardToCollection(message.guild.id, message.author.id, cardId, name);
      if (!result.ok) {
        const text = {
          collection_not_found: 'Collection not found.',
          card_not_owned: 'You do not own that card.',
          collection_full: 'Collections can contain a maximum of eight cards.',
          card_already_in_collection: 'That card is already in a collection.',
        }[result.code] || 'Use `$p add <card ID> <collection name>`.';
        return error(message, 'Could not add card', text);
      }
      return message.reply({ embeds: [buildSimpleEmbed('Card added', `Added \`${cardId}\` to **${name}**. (${result.count}/8)`)] });
    }
    case 'remove': {
      const cardId = String(rest[0] || '').trim();
      const name = rest.slice(1).join(' ').trim();
      const result = pokemon.removeCardFromCollection(message.guild.id, message.author.id, cardId, name);
      return result.ok
        ? message.reply({ embeds: [buildSimpleEmbed('Card removed', `Removed \`${cardId}\` from **${name}**. The card remains in your inventory.`)] })
        : error(message, 'Could not remove card', result.code === 'collection_not_found' ? 'Collection not found.' : 'That card is not in this collection.');
    }
    case 'sethex': {
      const hex = String(rest[rest.length - 1] || '');
      const name = rest.slice(0, -1).join(' ').trim();
      const result = pokemon.setCollectionHex(message.guild.id, message.author.id, name, hex);
      if (!result.ok) return error(message, 'Could not change collection colour', result.code === 'invalid_hex' ? 'Use a six-digit HEX colour, for example `#9370DB`.' : 'Collection not found.');
      return message.reply({ embeds: [buildSimpleEmbed('Collection colour updated', `**${name}** now uses **${result.hex}**.`, parseInt(result.hex.slice(1), 16))] });
    }
    case 'pokedex': return commandPokedex(message, rest);
    case 'stats':
    case 'profile': return commandStats(client, message);
    case 'quests':
    case 'quest': return commandQuests(message);
    case 'claim': return commandClaim(message, rest);
    case 'daily': return commandDaily(message);
    case 'leaderboard': return commandLeaderboard(client, message, rest);
    case 'setup': return commandSetup(message, rest);
    case 'event': return commandEvent(message, rest);
    case 'shop': return message.reply('Pokémon packs are sold in the EC shop. Use `$ecshop` to view them.');
    default: return error(message, 'Unknown Pokémon command', 'Use `$p help` to see the command list.');
  }
}

module.exports = {
  name: 'p',
  aliases: ['pokemon'],
  description: 'Pokémon cards, packs, collections and Pokédex.',
  category: 'pokemon',
  requiresEconomyRegistration: false,
  usage: '$p help',
  execute,
};
