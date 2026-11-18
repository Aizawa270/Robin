'use strict';

const { EmbedBuilder } = require('discord.js');
const pokemon = require('../../handlers/pokemonService');
const api = require('../../handlers/pokemonApi');
const {
  buildCardEmbed,
  buildPackButtons,
  buildCollectionSummary,
  buildCollectionCardEmbeds,
  buildSimpleEmbed,
  rarityInfo,
} = require('../../handlers/pokemonEmbeds');
const { canManageShop } = require('../../handlers/shopSystem');

const THEME = '#3B82F6';

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
    `**${balances.common}x** Common Packs`,
    `**${balances.rare}x** Rare Packs`,
    `**${balances.mythical}x** Mythical Packs`,
  ].join('\n');
}

async function showHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(THEME)
    .setTitle('Vanessa Pokémon')
    .setDescription('Collect Pokémon cards from Generations I–VII, build collections and complete your Pokédex.')
    .addFields(
      { name: 'Packs', value: '`$p packs`\n`$p pack <common|rare|mythic>`\n`$p pack <rarity> 10` (show all 10)\n`$p daily`', inline: true },
      { name: 'Cards', value: '`$p inventory [rarity] [page] [search]`\n`$p view <card ID>`\n`$p gift @user <IDs>`\n`$p burn <IDs>`', inline: true },
      { name: 'Collections', value: '`$p create collection <name>`\n`$p collections [@user]`\n`$p display [@user] <name>`\n`$p add <ID> <name>`\n`$p remove <ID> <name>`\n`$p sethex <name> <hex>`\n`$p delete collection <name>`' },
      { name: 'Progress', value: '`$p pokedex [generation 1-7]`\n`$p stats [@user]`\n`$p quests`\n`$p claim <quest ID>`\n`$p leaderboard [cards|mythical|unique|collections]`' },
      { name: 'Server events', value: '`$p event reward @user <rarity> [amount]`\n`$p setup sync`' },
      { name: 'EC shop', value: 'View `$ecshop` and purchase packs with `$ecbuy <item ID>`. Only EC shop products configured as Pokémon packs can be bought with this command.' },
    )
    .setFooter({ text: 'Inventories and collections are separate for each server.' })
    .setTimestamp();
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
    return error(message, 'Choose a pack', 'Use `$p pack common`, `$p pack rare` or `$p pack mythical`. Add `10` to display all ten cards at once.');
  }
  const result = pokemon.openPack(message.guild.id, message.author.id, rarity);
  if (!result.ok) {
    if (result.code === 'no_packs') return error(message, 'No packs available', `You don't own a ${rarity} pack. Check your balance with **$p packs** and visit **$ecshop**.`);
    if (result.code === 'already_opening') return error(message, 'Pack already opening', 'Finish your current pack opening first.');
    if (result.code === 'cooldown') return error(message, 'Pack cooldown', `You can open another pack in **${(result.remaining / 1000).toFixed(1)} seconds**.`);
    if (result.code === 'species_not_synced') return error(message, 'Pokémon data not ready', 'A server manager needs to run `$p setup sync` first.');
    return error(message, 'Could not open pack', 'Please try again.');
  }
  const packMessage = `**${message.author.username}** opened a **${rarityName(rarity)} Pack**! All 10 cards have been added to your inventory.`;

  if (showAll) {
    // Discord allows up to ten embeds in a single message. Each embed holds
    // one card's artwork and details, so this is a full-pack gallery view.
    return message.reply({
      content: `${packMessage}\nShowing all ten cards below.`,
      embeds: result.cards.map((card, index) =>
        buildCardEmbed(card, index, result.cards.length, result.counts)
      ),
      allowedMentions: { repliedUser: false, parse: [] },
    });
  }

  // Default mode: show one card at a time and let the owner browse all ten
  // with the left/right arrow buttons. The full pack is already saved.
  const sessionId = pokemon.createPackSession(message.guild.id, message.author.id, result.cards, result.counts);
  const firstEmbed = buildCardEmbed(result.cards[0], 0, result.cards.length, result.counts);
  return message.reply({
    content: `${packMessage}\nUse the arrow buttons to browse your cards.`,
    embeds: [firstEmbed],
    components: [buildPackButtons(sessionId)],
    allowedMentions: { repliedUser: false, parse: [] },
  });
}

async function commandInventory(message, args) {
  const mention = mentionUser(message);
  const target = mention || message.author;
  const rest = cleanArgs(args);
  const rarity = rest.find(value => pokemon.PACK_TYPES.includes(String(value).toLowerCase()));
  const pageArg = rest.find(value => /^\d+$/.test(String(value)));
  const search = rest.filter(value => value !== rarity && value !== pageArg).join(' ').trim();
  const page = Math.max(1, Number(pageArg) || 1);
  const result = pokemon.getInventory(message.guild.id, target.id, { rarity, page, search, limit: 10 });
  const title = target.id === message.author.id ? 'Your Pokémon Inventory' : `${target.username}'s Pokémon Inventory`;
  const lines = result.cards.map(card => {
    const label = rarityName(card.rarity);
    return `**${card.pokemon_name}** • ${label} • Gen ${card.generation}\nID: \`${card.card_id}\``;
  });
  const embed = buildSimpleEmbed(title, lines.length ? lines.join('\n\n') : 'No cards found on this page.')
    .setFooter({ text: `Page ${result.page}/${result.pages} • ${result.total} card(s)${rarity ? ` • ${rarityName(rarity)}` : ''}` })
    .setThumbnail(target.displayAvatarURL({ size: 256 }));
  return message.reply({ embeds: [embed] });
}

async function commandView(message, args) {
  const cardId = String(args[0] || '').trim();
  if (!cardId) return error(message, 'Missing card ID', 'Use `$p view <card ID>`.');
  const card = pokemon.getCard(message.guild.id, cardId);
  if (!card) return error(message, 'Card not found', 'That card ID does not exist in this server.');
  const embed = buildCardEmbed({ ...card, pokemon_name: card.pokemon_name }, 0, 1);
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
  return message.reply({ embeds: [buildSimpleEmbed('Cards gifted', `Transferred **${result.count}** card(s) to **${recipient.username}**. Cards are removed from any collection before transfer.`)] });
}

async function commandBurn(message, args) {
  const ids = cleanArgs(args).filter(value => /^[A-Za-z0-9]{6}$/.test(String(value)));
  const result = pokemon.burnCards(message.guild.id, message.author.id, ids);
  if (!result.ok) {
    if (result.code === 'card_not_owned') return error(message, 'Card not available', 'One or more IDs are invalid or are not in your inventory. No cards were removed.');
    return error(message, 'Missing card IDs', 'Use `$p burn <card ID> [card ID ...]` with up to 25 IDs.');
  }
  return message.reply({ embeds: [buildSimpleEmbed('Cards burned', `Permanently removed **${result.count}** card(s) from your inventory.`)] });
}

async function commandCollections(message, args) {
  const target = mentionUser(message) || message.author;
  const rows = pokemon.listCollections(message.guild.id, target.id);
  const description = rows.length
    ? rows.map(row => `**${row.name}** — ${row.card_count}/8 cards`).join('\n')
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
  const embeds = [buildCollectionSummary(display.collection, display.cards, target.username), ...buildCollectionCardEmbeds(display.cards)];
  // Discord allows up to ten embeds per message. A collection has at most eight cards.
  return message.reply({ embeds });
}

async function commandPokedex(message, args) {
  const rest = cleanArgs(args);
  const first = String(rest[0] || '').toLowerCase();
  const hasGeneration = /^gen(?:eration)?[1-7]$/.test(first) || /^[1-7]$/.test(first);
  const generation = hasGeneration ? Number(first.replace(/\D/g, '')) : null;
  const pageToken = hasGeneration ? rest[1] : (first === 'all' ? rest[1] : first);
  const page = Math.max(1, Number(pageToken) || 1);
  const status = api.getSyncStatus();
  if (!status.ready) return error(message, 'Pokédex not initialized', `Run **$p setup sync** first. Cached species: **${status.total}/${status.expected}**.`);
  const result = pokemon.getPokedex(message.guild.id, message.author.id, generation, page, 20);
  const lines = result.rows.map(row => `${row.discovered ? '✅' : '▫️'} **#${String(row.species_id).padStart(3, '0')} ${row.name}** • ${rarityName(row.rarity)}`);
  const percentage = result.total ? ((result.found / result.total) * 100).toFixed(1) : '0.0';
  const embed = buildSimpleEmbed(`Pokédex${generation ? ` • Generation ${generation}` : ''}`, `**${result.found}/${result.total} discovered (${percentage}%)**\n\n${lines.join('\n') || 'No species found.'}`)
    .setFooter({ text: `Page ${result.page}/${result.pages} • First discovery counts once; duplicates do not increase progress.` });
  return message.reply({ embeds: [embed] });
}

async function commandStats(client, message) {
  const target = mentionUser(message) || message.author;
  const stats = pokemon.getPlayerStats(message.guild.id, target.id);
  const embed = new EmbedBuilder()
    .setColor(THEME)
    .setTitle(`${target.username}'s Pokémon Stats`)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Cards owned', value: String(stats.cards_owned), inline: true },
      { name: 'Unique discovered', value: String(stats.unique_discovered), inline: true },
      { name: 'Collections', value: String(stats.collections), inline: true },
      { name: 'Packs opened', value: String(stats.packs_opened), inline: true },
      { name: 'Mythical cards collected', value: String(stats.mythical_collected), inline: true },
      { name: 'Rare cards collected', value: String(stats.rare_collected), inline: true },
    )
    .setTimestamp();
  return message.reply({ embeds: [embed] });
}

async function commandQuests(message) {
  const quests = pokemon.getQuests(message.guild.id, message.author.id);
  const lines = quests.map(quest => {
    const status = quest.claimed ? '✅ Claimed' : quest.completed ? '🎁 Ready to claim' : `${quest.progress}/${quest.target}`;
    return `**${quest.title}** · [1m${quest.id}[0m\n${quest.description}\nProgress: **${status}** • Reward: **${quest.rewardAmount}x ${rarityName(quest.rewardType)} Pack**`;
  });
  return message.reply({ embeds: [buildSimpleEmbed('Pokémon Quests', lines.join('\n\n') + '\n\nClaim completed quests with `$p claim <quest ID>`.')] });
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
  return message.reply({ embeds: [buildSimpleEmbed('Quest completed!', `You received **${result.quest.rewardAmount}x ${rarityName(result.quest.rewardType)} Pack**.`)] });
}

async function commandDaily(message) {
  const result = pokemon.claimDaily(message.guild.id, message.author.id);
  if (!result.ok) return error(message, 'Daily reward claimed', 'You have already claimed today\'s Pokémon reward. The daily reset follows UTC+6.');
  return message.reply({ embeds: [buildSimpleEmbed('Daily Pokémon Reward', `You received **${result.reward.amount}x ${rarityName(result.reward.type)} Pack**!\n\n${formatPackBalances(result.balances)}`)] });
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
    lines.push(`**${i + 1}.** ${user?.username || `User ${rows[i].user_id}`} — **${rows[i].score}**`);
  }
  return message.reply({ embeds: [buildSimpleEmbed(`Pokémon Leaderboard • ${labels[type]}`, lines.length ? lines.join('\n') : 'No leaderboard data yet.')] });
}

async function commandSetup(message, args) {
  if (!canManage(message)) return error(message, 'Access denied', 'Only the server owner, bot owner or members with Manage Server can run Pokémon setup.');
  const sub = String(args[0] || '').toLowerCase();
  if (sub !== 'sync') return error(message, 'Pokémon setup', 'Use `$p setup sync` to download and cache the first 809 species from PokéAPI.');
  const statusMessage = await message.reply({ embeds: [buildSimpleEmbed('Pokémon data sync', 'Connecting to PokéAPI and caching species information. This is normally a one-time setup task.')] });
  try {
    const result = await api.syncSpecies({
      onProgress: progress => {
        if (progress.stage === 'species' && (progress.completed % 100 === 0 || progress.completed === progress.total)) {
          statusMessage.edit({ embeds: [buildSimpleEmbed('Pokémon data sync', `Cached **${progress.completed}/${progress.total}** new species…`)] }).catch(() => {});
        }
      },
    });
    const genLines = result.byGeneration.map(row => `Gen ${row.generation}: ${row.count}`).join('\n');
    const rarityLines = result.byRarity.map(row => `${rarityName(row.rarity)}: ${row.count}`).join('\n');
    const description = `Cached **${result.totalCached}/809** species.\n\n**Generations**\n${genLines}\n\n**Species rarity registry**\n${rarityLines}` + (result.failures.length ? `\n\n**${result.failures.length} request(s) failed.** Run sync again to retry missing species.` : '');
    return statusMessage.edit({ embeds: [buildSimpleEmbed(result.ok ? 'Pokémon data ready' : 'Pokémon sync incomplete', description, result.ok ? 0x16A34A : 0xF59E0B)] });
  } catch (error) {
    console.error('[Pokémon API] Sync failed:', error);
    return statusMessage.edit({ embeds: [buildSimpleEmbed('Pokémon sync failed', `PokéAPI could not be reached.\n\n${String(error.message || error).slice(0, 700)}`, 0xED4245)] });
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
  const sub = String(args[0] || 'help').toLowerCase();
  const rest = args.slice(1);
  switch (sub) {
    case 'help': return showHelp(message);
    case 'packs': return commandPacks(message);
    case 'pack':
    case 'unpack': return commandUnpack(message, rest);
    case 'inventory':
    case 'inv': return commandInventory(message, rest);
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
        const text = { collection_not_found: 'Collection not found.', card_not_owned: 'You do not own that card.', collection_full: 'Collections can contain a maximum of eight cards.', card_already_in_collection: 'That card is already in a collection.' }[result.code] || 'Use `$p add <card ID> <collection name>`.';
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
      return message.reply({ embeds: [buildSimpleEmbed('Collection colour updated', `**${name}** now uses **${result.hex}**.` , parseInt(result.hex.slice(1), 16))] });
    }
    case 'pokedex': return commandPokedex(message, rest);
    case 'stats': return commandStats(client, message);
    case 'quests':
    case 'quest': return commandQuests(message);
    case 'claim': return commandClaim(message, rest);
    case 'daily': return commandDaily(message);
    case 'leaderboard': return commandLeaderboard(client, message, rest);
    case 'setup': return commandSetup(message, rest);
    case 'event': return commandEvent(message, rest);
    case 'shop': return message.reply('Pokémon packs are sold in the EC shop. Use `$ecshop` to view them.');
    default: return showHelp(message);
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
