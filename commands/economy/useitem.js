const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'useitem',
  description: 'Use an item from your inventory',
  category: 'economy',
  usage: '!useitem <item_slug>',
  async execute(client, message, args) {
    if (!args[0]) return message.reply('Provide an item slug.');

    const slug = args[0].toLowerCase();
    const item = items.getMasterItem(slug);
    if (!item) return message.reply('Item not found.');

    const qty = items.getUserItemQty(message.author.id, item.id);
    if (qty < 1) return message.reply('You do not own this item.');

    const data = JSON.parse(item.data || '{}');

    // faction check
    const user = econ.getUser(message.author.id);
    if (data.factionOnly && !user.faction_id) {
      return message.reply('Faction-only item.');
    }

    // consume
    items.removeItem(message.author.id, item.id, 1);

    // apply effects
    let effects = [];
    if (data.jobBoost) {
      econ.applyModifier(message.author.id, 'jobBoost', data.jobBoost);
      effects.push(`Job earnings boosted (+${data.jobBoost}%)`);
    }
    if (data.gambleEdge) {
      econ.applyModifier(message.author.id, 'gambleEdge', data.gambleEdge);
      effects.push(`Hidden gambling edge applied`);
    }
    if (data.cooldownReduce) {
      econ.applyModifier(message.author.id, 'cooldownReduce', data.cooldownReduce);
      effects.push(`Cooldowns reduced`);
    }

    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle(`Item Used — ${item.name}`)
      .setDescription(effects.join('\n') || 'Item consumed.');

    return message.reply({ embeds: [embed] });
  }
};