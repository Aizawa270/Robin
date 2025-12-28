// commands/economy/useitem.js
const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');
const econ = require('../../handlers/economy'); // if you need to affect economy
const db = items.db; // direct db access (items handler exposes db)

function humanizeEffect(effect) {
  if (!effect) return 'No effect data.';
  // quick friendly conversions for common patterns
  if (effect.startsWith('job_bonus_')) return `Increases next job payout by ${effect.split('_').pop()}%.`;
  if (effect === 'reroll_gamble') return 'Grants one gamble reroll (auto usable on next lost gamble).';
  if (effect.startsWith('cooldown_')) return `Reduces certain cooldowns by ${effect.split('_').pop()} minutes.`;
  if (effect.startsWith('bank_eff_')) return `Improves bank efficiency (${effect.split('_').pop()}%).`;
  if (effect === 'double_work') return 'Doubles your next work payout (single use).';
  if (effect === 'unlock_shady') return 'Unlocks shady job paths (passive).';
  if (effect === 'skip_job_cd') return 'Skip the next job cooldown (single use).';
  if (effect === 'scrap_item') return 'Convert an item into coins (use via special command).';
  if (effect.startsWith('inv_slot')) return 'Expands inventory capacity.';
  if (effect === 'risky_job') return 'Next job has increased payout but risk of fines.';
  if (effect === 'gamble_loss_3') return 'Reduces gambling loss impact slightly (passive).';
  if (effect === 'see_odds') return 'Reveal odds in next gamble (single use).';
  if (effect === 'guarantee_win') return 'Guarantees your next gamble win (single use).';
  if (effect === 'reset_cd') return 'Resets many cooldowns (single use).';
  if (effect === 'negate_loss') return 'Negates one loss in gambling or events (single use).';
  if (effect === 'reroll_any') return 'Reroll any outcome once per week.';
  // default fallback
  return effect.split(/[_\-]/).map(p => p.toUpperCase()).join(' ');
}

module.exports = {
  name: 'useitem',
  description: 'Use an item from your inventory.',
  usage: '!useitem <item_slug>',
  category: 'economy',
  aliases: ['use', 'consume'],
  async execute(client, message, args) {
    if (!args[0]) return message.reply('Please provide an item slug. Example: `!useitem reality-die`');

    const slug = args[0].toLowerCase();
    const item = items.getItemBySlug(slug);
    if (!item) return message.reply('Item not found.');

    const qty = items.getUserItemQty(message.author.id, item.id);
    if (!qty) return message.reply('You do not have this item.');

    try {
      // Ensure support tables for active/passive effects exist
      db.prepare(`
        CREATE TABLE IF NOT EXISTS active_effects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          item_id INTEGER NOT NULL,
          effect TEXT,
          applied_at INTEGER NOT NULL,
          expires_at INTEGER
        )
      `).run();

      db.prepare(`
        CREATE TABLE IF NOT EXISTS user_passives (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          item_id INTEGER NOT NULL,
          effect TEXT,
          applied_at INTEGER NOT NULL
        )
      `).run();

      // Remove the item (consume one)
      const removed = items.removeItem(message.author.id, item.id, 1);
      if (!removed) return message.reply('Failed to consume the item (insufficient quantity).');

      const now = Date.now();
      let effectText = '';
      if ((item.type || '').toLowerCase() === 'active') {
        // default duration: 20 minutes (you can adjust per-effect later)
        const duration = 20 * 60 * 1000;
        const expires = now + duration;
        db.prepare(`
          INSERT INTO active_effects (user_id, item_id, effect, applied_at, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(message.author.id, item.id, item.effect || null, now, expires);

        effectText = `Active effect applied (expires in 20 minutes). ${humanizeEffect(item.effect)}`;
      } else {
        // passive: persists (until removed by admin or logic)
        db.prepare(`
          INSERT INTO user_passives (user_id, item_id, effect, applied_at)
          VALUES (?, ?, ?, ?)
        `).run(message.author.id, item.id, item.effect || null, now);

        effectText = `Passive effect granted. ${humanizeEffect(item.effect)}`;
      }

      // Build embed
      const embed = new EmbedBuilder()
        .setTitle(`Used Item: ${item.name}`)
        .setColor('#0ea5e9')
        .setDescription(effectText)
        .addFields(
          { name: 'Item', value: `${item.name} (\`${item.slug}\`)`, inline: true },
          { name: 'Remaining', value: `${items.getUserItemQty(message.author.id, item.id)}`, inline: true },
          { name: 'Type', value: `${item.type}`, inline: true }
        );

      return message.reply({ embeds: [embed] });
    } catch (err) {
      console.error('useitem error:', err);
      return message.reply('Failed to use item. Check console.');
    }
  }
};