'use strict';\
\
const {\
&#x20; EmbedBuilder,\
&#x20; ActionRowBuilder,\
&#x20; ButtonBuilder,\
&#x20; ButtonStyle,\
&#x20; AttachmentBuilder,\
} = require('discord.js');\
const service = require('./pokemonService');\
const { emoji } = require('./pokemonEmojis');\
\
const THEME = '#3B82F6';\
\
const TYPE_COLORS = Object.freeze({\
&#x20; normal: 0xA8A878,\
&#x20; fire: 0xF08030,\
&#x20; water: 0x6890F0,\
&#x20; electric: 0xF8D030,\
&#x20; grass: 0x78C850,\
&#x20; ice: 0x98D8D8,\
&#x20; fighting: 0xC03028,\
&#x20; poison: 0xA040A0,\
&#x20; ground: 0xE0C068,\
&#x20; flying: 0xA890F0,\
&#x20; psychic: 0xF85888,\
&#x20; bug: 0xA8B820,\
&#x20; rock: 0xB8A038,\
&#x20; ghost: 0x705898,\
&#x20; dragon: 0x7038F8,\
&#x20; dark: 0x705848,\
&#x20; steel: 0xB8B8D0,\
&#x20; fairy: 0xEE99AC,\
});\
\
function rarityInfo(rarity) {\
&#x20; return service.CARD_RARITY[String(rarity || 'common').toLowerCase()] || service.CARD_RARITY.common;\
}\
\
function getTypes(card) {\
&#x20; if (Array.isArray(card?.types)) return card.types.filter(Boolean).map(String);\
&#x20; if (typeof card?.types === 'string') {\
&#x20;   try {\
&#x20;     const parsed = JSON.parse(card.types);\
&#x20;     return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];\
&#x20;   } catch {\
&#x20;     return [];\
&#x20;   }\
&#x20; }\
&#x20; return [];\
}\
\
function getPokemonColor(card, fallback = 0x3B82F6) {\
&#x20; const types = getTypes(card);\
&#x20; const colors = types.map(type => TYPE_COLORS[type.toLowerCase()]).filter(Number.isInteger);\
&#x20; if (!colors.length) return fallback;\
\
&#x20; const channels = colors.map(color => ({\
&#x20;   r: (color >> 16) & 255,\
&#x20;   g: (color >> 8) & 255,\
&#x20;   b: color & 255,\
&#x20; }));\
&#x20; const average = channels.reduce((acc, color) => ({\
&#x20;   r: acc.r + color.r / channels.length,\
&#x20;   g: acc.g + color.g / channels.length,\
&#x20;   b: acc.b + color.b / channels.length,\
&#x20; }), { r: 0, g: 0, b: 0 });\
\
&#x20; return (Math.round(average.r) << 16) | (Math.round(average.g) << 8) | Math.round(average.b);\
}\
\
function buildCardEmbed(card, index = 0, total = 1, counts = null) {\
&#x20; const info = rarityInfo(card.rarity);\
&#x20; const types = getTypes(card);\
&#x20; const typeLabel = types.length\
&#x20;   ? types.map(type => type.charAt(0).toUpperCase() + type.slice(1)).join(' / ')\
&#x20;   : 'Unknown';\
&#x20; const name = card.pokemon_name || card.name || 'Unknown Pokémon';\
\
&#x20; const embed = new EmbedBuilder()\
&#x20;   .setColor(getPokemonColor(card, info.color))\
&#x20;   .setTitle(\`${emoji('pokemon', '◈')}${name}\`)\
&#x20;   .setDescription(\`\*\*${info.label} Pokémon Card\*\*\n${typeLabel} type\`)\
&#x20;   .addFields(\
&#x20;     { name: 'Card ID', value: \`\\\`${card.card_id}\\\`\`, inline: true },\
&#x20;     { name: 'Generation', value: \`Generation ${card.generation || '?'}\`, inline: true },\
&#x20;     { name: 'Pokédex', value: \`#${String(card.species_id || '').padStart(3, '0')}\`, inline: true },\
&#x20;   )\
&#x20;   .setFooter({ text: \`Card ${index + 1} / ${total}${counts ? \` • ${counts.common} Common • ${counts.rare} Rare • ${counts.mythical} Mythical\` : ''}\` })\
&#x20;   .setTimestamp();\
\
&#x20; if (card.artwork_url) embed.setImage(card.artwork_url);\
&#x20; return embed;\
}\
\
function buildPackButtons(sessionId) {\
&#x20; return new ActionRowBuilder().addComponents(\
&#x20;   new ButtonBuilder()\
&#x20;     .setCustomId(\`pokemon:pack:${sessionId}:prev\`)\
&#x20;     .setLabel('‹')\
&#x20;     .setStyle(ButtonStyle.Secondary),\
&#x20;   new ButtonBuilder()\
&#x20;     .setCustomId(\`pokemon:pack:${sessionId}:next\`)\
&#x20;     .setLabel('›')\
&#x20;     .setStyle(ButtonStyle.Secondary),\
&#x20;   new ButtonBuilder()\
&#x20;     .setCustomId(\`pokemon:pack:${sessionId}:close\`)\
&#x20;     .setLabel('Close')\
&#x20;     .setStyle(ButtonStyle.Secondary),\
&#x20; );\
}\
\
// Discord does not offer a transparent button style. Secondary is the least\
// visually prominent neutral style and keeps pagination subdued.\
function buildBrowseButtons(sessionId, page, pages) {\
&#x20; const current = Math.max(1, Number(page) || 1);\
&#x20; const total = Math.max(1, Number(pages) || 1);\
&#x20; const atStart = current <= 1;\
&#x20; const atEnd = current >= total;\
\
&#x20; return new ActionRowBuilder().addComponents(\
&#x20;   new ButtonBuilder()\
&#x20;     .setCustomId(\`pokemon:browse:${sessionId}:first\`)\
&#x20;     .setLabel('≪')\
&#x20;     .setStyle(ButtonStyle.Secondary)\
&#x20;     .setDisabled(atStart),\
&#x20;   new ButtonBuilder()\
&#x20;     .setCustomId(\`pokemon:browse:${sessionId}:prev\`)\
&#x20;     .setLabel('‹')\
&#x20;     .setStyle(ButtonStyle.Secondary)\
&#x20;     .setDisabled(atStart),\
&#x20;   new ButtonBuilder()\
&#x20;     .setCustomId(\`pokemon:browse:${sessionId}:page\`)\
&#x20;     .setLabel(\`${current} / ${total}\`)\
&#x20;     .setStyle(ButtonStyle.Secondary)\
&#x20;     .setDisabled(true),\
&#x20;   new ButtonBuilder()\
&#x20;     .setCustomId(\`pokemon:browse:${sessionId}:next\`)\
&#x20;     .setLabel('›')\
&#x20;     .setStyle(ButtonStyle.Secondary)\
&#x20;     .setDisabled(atEnd),\
&#x20;   new ButtonBuilder()\
&#x20;     .setCustomId(\`pokemon:browse:${sessionId}:last\`)\
&#x20;     .setLabel('≫')\
&#x20;     .setStyle(ButtonStyle.Secondary)\
&#x20;     .setDisabled(atEnd),\
&#x20; );\
}\
\
function buildInventoryEmbed(result, title, rarity = null, avatarURL = null) {\
&#x20; const lines = (result.cards || []).map(card => {\
&#x20;   const info = rarityInfo(card.rarity);\
&#x20;   const types = getTypes(card);\
&#x20;   const typeLabel = types.length ? types.join(' / ') : 'Type unavailable';\
&#x20;   return \`${emoji('pokemon', '◈')}\*\*${card.pokemon_name || 'Unknown Pokémon'}\*\* • ${info.label}\n${typeLabel} • Gen ${card.generation || '?'}\nID: \\\`${card.card_id}\\\`\`;\
&#x20; });\
\
&#x20; const embed = new EmbedBuilder()\
&#x20;   .setColor(THEME)\
&#x20;   .setTitle(title || 'Your Pokémon Inventory')\
&#x20;   .setDescription(lines.length ? lines.join('\n\n') : 'No cards found on this page.')\
&#x20;   .setFooter({\
&#x20;     text: \`Page ${result.page}/${result.pages} • ${result.total} card(s)${rarity ? \` • ${rarityInfo(rarity).label}\` : ''}\`,\
&#x20;   })\
&#x20;   .setTimestamp();\
\
&#x20; if (avatarURL) embed.setThumbnail(avatarURL);\
&#x20; return embed;\
}\
\
function buildPokedexEmbed(result, generation = null) {\
&#x20; const lines = (result.rows || []).map(row =>\
&#x20;   \`${emoji(row\.discovered ? 'discovered' : 'undiscovered', row\.discovered ? '●' : '○')}${emoji('pokemon', '◈')}\*\*#${String(row\.species_id).padStart(3, '0')} ${row\.name}\*\* • ${emoji(row\.rarity)}${rarityInfo(row\.rarity).label}\`\
&#x20; );\
&#x20; const percentage = result.total\
&#x20;   ? ((result.found / result.total) \* 100).toFixed(1)\
&#x20;   : '0.0';\
\
&#x20; return new EmbedBuilder()\
&#x20;   .setColor(THEME)\
&#x20;   .setTitle(\`Pokédex${generation ? \` • Generation ${generation}\` : ''}\`)\
&#x20;   .setDescription(\`\*\*${result.found}/${result.total} discovered (${percentage}%)\*\*\n\n${lines.join('\n') || 'No species found.'}\`)\
&#x20;   .setFooter({\
&#x20;     text: \`Page ${result.page}/${result.pages} • First discovery counts once; duplicates do not increase progress.\`,\
&#x20;   })\
&#x20;   .setTimestamp();\
}\
\
function buildCollectionSummary(collection, cards, ownerLabel) {\
&#x20; const embed = new EmbedBuilder()\
&#x20;   .setColor(collection.hex_color || THEME)\
&#x20;   .setTitle(\`${emoji('collection', '')}${collection.name}\`)\
&#x20;   .setDescription(\`A collection by \*\*${ownerLabel || 'Collector'}\*\*  ·  \*\*${cards.length}/8 Pokémon\*\*\`)\
&#x20;   .setFooter({ text: 'Each card can belong to one collection at a time.' })\
&#x20;   .setTimestamp();\
\
&#x20; if (!cards.length) {\
&#x20;   embed.addFields({ name: 'Collection', value: 'No Pokémon have been added yet. Use \`$p add \<card ID> \<collection name>\` to add one.' });\
&#x20;   return embed;\
&#x20; }\
\
&#x20; const renderCard = (card, index) => {\
&#x20;   const info = rarityInfo(card.rarity);\
&#x20;   const types = getTypes(card);\
&#x20;   const typeLabel = types.length ? types.join(' / ') : 'Type unavailable';\
&#x20;   const artwork = card.artwork_url ? \` • [Artwork]\(${card.artwork_url})\` : '';\
&#x20;   return \`${emoji('pokemon', '◈')}\*\*${index + 1}. ${card.pokemon_name || 'Unknown Pokémon'}\*\*\n${info.label} • ${typeLabel} • Gen ${card.generation || '?'}\nID: \\\`${card.card_id}\\\`${artwork}\`;\
&#x20; };\
\
&#x20; // Even-numbered slots form the left column; odd-numbered slots form the\
&#x20; // right column. Inline fields display as a compact side-by-side grid.\
&#x20; const left = cards.filter((\_card, index) => index % 2 === 0)\
&#x20;   .map((card, index) => renderCard(card, index \* 2));\
&#x20; const right = cards.filter((\_card, index) => index % 2 === 1)\
&#x20;   .map((card, index) => renderCard(card, index \* 2 + 1));\
\
&#x20; embed.addFields(\
&#x20;   { name: 'Column 1', value: left.join('\n\n').slice(0, 1024) || '\u200b', inline: true },\
&#x20;   { name: 'Column 2', value: right.join('\n\n').slice(0, 1024) || '\u200b', inline: true },\
&#x20; );\
&#x20; return embed;\
}\
\
async function buildCollectionGallery(cards, collection = {}, ownerLabel = '') {\
&#x20; if (!Array.isArray(cards) || !cards.length) return null;\
\
&#x20; let canvasModule;\
&#x20; try {\
&#x20;   canvasModule = require('@napi-rs/canvas');\
&#x20; } catch {\
&#x20;   return null;\
&#x20; }\
\
&#x20; const { createCanvas, loadImage } = canvasModule;\
\
&#x20; // Transparent gallery: only Pokémon artwork and labels are drawn.\
&#x20; // No background fill, white panels, borders, cards, or tile shapes.\
&#x20; const columns = 4;\
&#x20; const rows = 2;\
&#x20; const width = 1200;\
&#x20; const height = 660;\
&#x20; const canvas = createCanvas(width, height);\
&#x20; const ctx = canvas.getContext('2d');\
&#x20; const slotWidth = width / columns;\
&#x20; const rowHeight = height / rows;\
\
&#x20; const fitFont = (text, maxWidth, startSize = 22, minSize = 14) => {\
&#x20;   let size = startSize;\
&#x20;   while (size > minSize) {\
&#x20;     ctx.font = \`700 ${size}px sans-serif\`;\
&#x20;     if (ctx.measureText(text).width <= maxWidth) break;\
&#x20;     size--;\
&#x20;   }\
&#x20;   ctx.font = \`700 ${size}px sans-serif\`;\
&#x20; };\
\
&#x20; const drawPokemon = async (card, index) => {\
&#x20;   const column = index % columns;\
&#x20;   const row = Math.floor(index / columns);\
&#x20;   const centerX = column \* slotWidth + slotWidth / 2;\
&#x20;   const rowTop = row \* rowHeight;\
&#x20;   const artworkCenterY = rowTop + 138;\
\
&#x20;   if (card.artwork_url) {\
&#x20;     const controller = new AbortController();\
&#x20;     const timeout = setTimeout(() => controller.abort(), 7000);\
&#x20;     try {\
&#x20;       const response = await fetch(card.artwork_url, {\
&#x20;         signal: controller.signal,\
&#x20;       });\
\
&#x20;       if (response.ok) {\
&#x20;         const bytes = Buffer.from(await response.arrayBuffer());\
&#x20;         if (bytes.length > 0 && bytes.length <= 5 \* 1024 \* 1024) {\
&#x20;           const image = await loadImage(bytes);\
&#x20;           const maxArtworkWidth = 230;\
&#x20;           const maxArtworkHeight = 230;\
&#x20;           const scale = Math.min(\
&#x20;             maxArtworkWidth / image.width,\
&#x20;             maxArtworkHeight / image.height,\
&#x20;             1\
&#x20;           );\
&#x20;           const drawWidth = image.width \* scale;\
&#x20;           const drawHeight = image.height \* scale;\
\
&#x20;           ctx.drawImage(\
&#x20;             image,\
&#x20;             centerX - drawWidth / 2,\
&#x20;             artworkCenterY - drawHeight / 2,\
&#x20;             drawWidth,\
&#x20;             drawHeight\
&#x20;           );\
&#x20;         }\
&#x20;       }\
&#x20;     } catch {\
&#x20;       // Keep this slot transparent if an artwork request fails.\
&#x20;     } finally {\
&#x20;       clearTimeout(timeout);\
&#x20;     }\
&#x20;   }\
\
&#x20;   const name = String(card.pokemon_name || 'Unknown Pokémon');\
&#x20;   ctx.textAlign = 'center';\
&#x20;   ctx.textBaseline = 'middle';\
&#x20;   fitFont(name, slotWidth - 28, 22, 14);\
\
&#x20;   // A restrained outlined label stays readable on Discord's light and\
&#x20;   // dark themes without putting a panel or opaque background behind it.\
&#x20;   const labelY = rowTop + 285;\
&#x20;   ctx.lineJoin = 'round';\
&#x20;   ctx.lineWidth = 5;\
&#x20;   ctx.strokeStyle = 'rgba(20, 27, 39, 0.78)';\
&#x20;   ctx.strokeText(name, centerX, labelY, slotWidth - 30);\
&#x20;   ctx.fillStyle = '#FFFFFF';\
&#x20;   ctx.fillText(name, centerX, labelY, slotWidth - 30);\
\
&#x20;   const details = \`${rarityInfo(card.rarity).label}  ·  Gen ${card.generation || '?'}\`;\
&#x20;   ctx.font = '500 14px sans-serif';\
&#x20;   ctx.lineWidth = 4;\
&#x20;   ctx.strokeStyle = 'rgba(20, 27, 39, 0.72)';\
&#x20;   ctx.strokeText(details, centerX, labelY + 27, slotWidth - 32);\
&#x20;   ctx.fillStyle = '#E6EAF0';\
&#x20;   ctx.fillText(details, centerX, labelY + 27, slotWidth - 32);\
&#x20;   ctx.textAlign = 'left';\
&#x20;   ctx.textBaseline = 'alphabetic';\
&#x20; };\
\
&#x20; // Always draw in the supplied order: slots 1–4 on top, 5–8 below.\
&#x20; await Promise.all(cards.slice(0, 8).map(drawPokemon));\
\
&#x20; return new AttachmentBuilder(canvas.toBuffer('image/png'), {\
&#x20;   name: 'pokemon-collection.png',\
&#x20; });\
}\
\
function buildCollectionCardEmbeds(cards) {\
&#x20; return cards.map((card, index) => {\
&#x20;   const info = rarityInfo(card.rarity);\
&#x20;   const types = getTypes(card);\
&#x20;   const typeLabel = types.length ? types.join(' / ') : 'Type unavailable';\
&#x20;   const embed = new EmbedBuilder()\
&#x20;     .setColor(getPokemonColor(card, info.color))\
&#x20;     .setTitle(\`${index + 1}. ${emoji('pokemon', '◈')}${card.pokemon_name || 'Unknown Pokémon'}\`)\
&#x20;     .setDescription(\`${info.label} • ${typeLabel} • Gen ${card.generation || '?'}\nCard ID: \\\`${card.card_id}\\\` • Pokédex: #${String(card.species_id || '').padStart(3, '0')}\`);\
&#x20;   if (card.artwork_url) embed.setImage(card.artwork_url);\
&#x20;   return embed;\
&#x20; });\
}\
\
function buildSimpleEmbed(title, description, color = THEME) {\
&#x20; return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();\
}\
\
module.exports = {\
&#x20; THEME,\
&#x20; TYPE_COLORS,\
&#x20; rarityInfo,\
&#x20; getTypes,\
&#x20; getPokemonColor,\
&#x20; buildCardEmbed,\
&#x20; buildPackButtons,\
&#x20; buildBrowseButtons,\
&#x20; buildInventoryEmbed,\
&#x20; buildPokedexEmbed,\
&#x20; buildCollectionSummary,\
&#x20; buildCollectionGallery,\
&#x20; buildCollectionCardEmbeds,\
&#x20; buildSimpleEmbed,\
};\
