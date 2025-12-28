// commands/economy/itemslist.js
const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_TITLE = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary'
};

module.exports = {
  name: 'itemslist',
  description: 'List all items (grouped by rarity).',
  category: 'economy',
  usage: '!itemslist',
  aliases: ['ilist', 'items'],
  async execute(client, message, args) {
    try {
      const all = items.listMasterItems();
      if (!all || !all.length) return message.reply('No items found.');

      // Group by rarity
      const groups = {};
      for (const r of RARITY_ORDER) groups[r] = [];
      for (const it of all) {
        const r = (it.rarity || 'common').toLowerCase();
        if (!groups[r]) groups[r] = [];
        groups[r].push(it);
      }

      // Create one embed per rarity (only if items present)
      const embeds = [];
      for (const r of RARITY_ORDER) {
        const list = groups[r];
        if (!list || !list.length) continue;

        const embed = new EmbedBuilder()
          .setTitle(`Items — ${RARITY_TITLE[r]}`)
          .setColor('#1f2937');

        // Add items as fields (safe under 25 per embed in your seed)
        for (const it of list) {
          // Field name: name + slug
          const fieldName = `${it.name} — \`${it.slug}\``;
          // Value: short description and type/effect
          let value = `${it.description || 'No description.'}\nType: ${it.type || 'unknown'}`;
          if (it.effect) value += ` • Effect: \`${it.effect}\``;
          // truncate value if needed
          if (value.length > 1024) value = value.slice(0, 1021) + '...';
          embed.addFields({ name: fieldName, value, inline: false });
        }

        embeds.push(embed);
      }

      // Send — if too many embeds (should be <=5), send them sequentially
      for (const e of embeds) {
        await message.reply({ embeds: [e] });
      }
    } catch (err) {
      console.error('itemslist error:', err);
      return message.reply('Failed to list items. Check console.');
    }
  }
};