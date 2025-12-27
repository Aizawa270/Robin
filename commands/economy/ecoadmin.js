// commands/economy/ecoadmin.js
const { EmbedBuilder } = require('discord.js');
const econ = require('../../handlers/economy');
const itemsHandler = require('../../handlers/items');

const ADMIN_ROLE_IDS = ['1447894643277561856', '1431646610752012420'];

module.exports = {
  name: 'ecoadmin',
  description: 'Admin commands for economy system',
  category: 'economy',
  adminOnly: true,
  usage: '!ecoadmin <subcommand>',
  async execute(client, message, args) {
    if (!message.member.roles.cache.some(r => ADMIN_ROLE_IDS.includes(r.id))) {
      return message.reply({ content: "❌ You don't have permission to use this." });
    }

    const sub = args[0]?.toLowerCase();
    if (!sub) return message.reply({ content: '❌ Please provide a subcommand: addmoney | resetmoney | resetuser | giveitem | removeitem' });

    const target = message.mentions.users.first() || (args[1] ? await client.users.fetch(args[1]).catch(()=>null) : null);
    if (!target) return message.reply({ content: '❌ Target user not found.' });

    switch (sub) {
      case 'addmoney': {
        const amount = parseInt(args[2]);
        if (isNaN(amount)) return message.reply('❌ Invalid amount.');
        econ.addWallet(target.id, amount);
        return message.reply({ content: `✅ Added **${amount} coins** to ${target.tag}'s wallet.` });
      }
      case 'resetmoney': {
        econ.setWallet(target.id, 0);
        return message.reply({ content: `✅ Reset ${target.tag}'s wallet to 0.` });
      }
      case 'resetuser': {
        econ.setWallet(target.id, 0);
        econ.addBank(target.id, -econ.getUser(target.id).bank);
        itemsHandler.getUserInventory(target.id).forEach(i => {
          itemsHandler.removeItem(target.id, i.item_id, i.quantity);
        });
        return message.reply({ content: `✅ Reset all data for ${target.tag}.` });
      }
      case 'giveitem': {
        const itemSlug = args[2];
        const qty = parseInt(args[3]) || 1;
        const item = itemsHandler.getMasterItem(itemSlug);
        if (!item) return message.reply('❌ Item not found.');
        itemsHandler.giveItem(target.id, item.id, qty);
        return message.reply({ content: `✅ Gave **${qty}x ${item.name}** to ${target.tag}.` });
      }
      case 'removeitem': {
        const itemSlug = args[2];
        const qty = parseInt(args[3]) || 1;
        const item = itemsHandler.getMasterItem(itemSlug);
        if (!item) return message.reply('❌ Item not found.');
        const success = itemsHandler.removeItem(target.id, item.id, qty);
        if (!success) return message.reply('❌ User does not have enough of this item.');
        return message.reply({ content: `✅ Removed **${qty}x ${item.name}** from ${target.tag}.` });
      }
      default:
        return message.reply({ content: '❌ Unknown subcommand. Options: addmoney | resetmoney | resetuser | giveitem | removeitem' });
    }
  }
};