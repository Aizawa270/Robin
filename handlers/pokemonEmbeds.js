'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const service = require('./pokemonService');

const THEME = '#3B82F6';

function rarityInfo(rarity) {
  return service.CARD_RARITY[String(rarity || 'common').toLowerCase()] || service.CARD_RARITY.common;
}

function buildCardEmbed(card, index = 0, total = 1, counts = null) {
  const info = rarityInfo(card.rarity);
  const embed = new EmbedBuilder()
    .setColor(info.color)
    .setTitle(card.pokemon_name || card.name || 'Unknown Pokémon')
    .setDescription(`**${info.label} Pokémon Card**`)
    .addFields(
      { name: 'Card ID', value: `\`${card.card_id}\``, inline: true },
      { name: 'Generation', value: `Generation ${card.generation || '?'}`, inline: true },
      { name: 'Species ID', value: `#${String(card.species_id || '').padStart(3, '0')}`, inline: true },
    )
    .setFooter({ text: `Card ${index + 1} / ${total}${counts ? ` • ${counts.common} Common • ${counts.rare} Rare • ${counts.mythical} Mythical` : ''}` })
    .setTimestamp();
  if (card.artwork_url) embed.setImage(card.artwork_url);
  return embed;
}

function buildPackButtons(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pokemon:pack:${sessionId}:prev`)
      .setLabel('⬅️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`pokemon:pack:${sessionId}:next`)
      .setLabel('➡️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`pokemon:pack:${sessionId}:close`)
      .setLabel('✖ Close')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildCollectionSummary(collection, cards, ownerLabel) {
  const embed = new EmbedBuilder()
    .setColor(collection.hex_color || THEME)
    .setTitle(`📚 ${collection.name}`)
    .setDescription(`**${cards.length}/8 cards** • ${ownerLabel || 'Collection'}`)
    .setFooter({ text: 'A card can only belong to one collection at a time.' })
    .setTimestamp();
  if (!cards.length) embed.addFields({ name: 'Empty collection', value: 'Use `$p add <card ID> <collection name>` to add a card.' });
  return embed;
}

function buildCollectionCardEmbeds(cards) {
  return cards.map((card, index) => {
    const info = rarityInfo(card.rarity);
    const embed = new EmbedBuilder()
      .setColor(info.color)
      .setTitle(`${index + 1}. ${card.pokemon_name}`)
      .setDescription(`${info.label} • Gen ${card.generation} • \`${card.card_id}\``);
    if (card.artwork_url) embed.setThumbnail(card.artwork_url);
    return embed;
  });
}

function buildSimpleEmbed(title, description, color = THEME) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}

module.exports = {
  THEME,
  rarityInfo,
  buildCardEmbed,
  buildPackButtons,
  buildCollectionSummary,
  buildCollectionCardEmbeds,
  buildSimpleEmbed,
};
