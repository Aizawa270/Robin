// commands/economy/trade.js
const { EmbedBuilder } = require('discord.js');
const items = require('../../handlers/items');
const econ = require('../../handlers/economy');

function parseOfferString(str) {
  // formats accepted:
  // coins:100
  // item:slug:qty  OR item:id:qty
  // multiple pieces separated by comma
  // returns { coins: number, items: [{ item_id, qty }] }
  const out = { coins: 0, items: [] };
  if (!str) return out;
  const parts = str.split(',');
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    if (p.startsWith('coins:')) {
      const n = parseInt(p.split(':')[1]) || 0;
      out.coins += n;
      continue;
    }
    // item:id:qty OR item:slug:qty
    const seg = p.split(':');
    if (seg.length >= 3 && (seg[0] === 'item' || seg[0] === 'i')) {
      const idOrSlug = seg[1];
      const qty = Math.max(1, parseInt(seg[2]) || 1);
      let master = null;
      if (/^\d+$/.test(idOrSlug)) master = items.getMasterItem(Number(idOrSlug));
      else master = items.getMasterItem(idOrSlug.toLowerCase());
      if (!master) continue;
      out.items.push({ item_id: master.id, qty });
    }
  }
  return out;
}

module.exports = {
  name: 'trade',
  aliases: [],
  category: 'economy',
  usage: '$trade @user <yourOffer> <theirOffer>',
  description: 'Send a trade request. Offer format examples: coins:100 OR item:common-kit:1 OR item:3:2. Multiple separated by comma.',
  async execute(client, message, args) {
    const target = message.mentions.users.first() || (args[0] && await client.users.fetch(args[0]).catch(()=>null));
    if (!target) return message.reply('Usage: $trade @user <yourOffer> <theirOffer>');
    // remaining args: yourOffer then theirOffer
    // split by " | " (pipe) or a second argument
    const rest = message.content.split(/\s+/).slice(1); // crude but enough: [@user, ...]
    // find index of mention in rest and then consume the rest
    // easier: reconstruct from raw and remove command + mention
    const raw = message.content;
    const after = raw.slice(raw.indexOf(target.id) + target.id.length).trim(); // remaining text after mention
    if (!after) return message.reply('Provide offers. Example: `$trade @user coins:100 item:common-kit:1 | coins:50`');
    let parts = after.split('|').map(s => s.trim());
    if (parts.length < 2) return message.reply('Split offers with `|`. Example: `yourOffer | theirOffer`');
    const yourOfferRaw = parts[0];
    const theirOfferRaw = parts[1];

    const yourOffer = parseOfferString(yourOfferRaw);
    const theirOffer = parseOfferString(theirOfferRaw);

    // validate that sender has offered assets
    // coins
    const you = econ.getUser(message.author.id);
    if ((yourOffer.coins || 0) > (you.wallet || 0)) return message.reply('You do not have enough coins for that offer.');

    // items
    for (const it of yourOffer.items) {
      const have = items.getUserItemQty(message.author.id, it.item_id);
      if (have < it.qty) return message.reply(`You don't have enough of item id ${it.item_id}.`);
    }

    // create trade
    const t = items.createTrade(message.author.id, target.id, yourOffer, theirOffer);

    const embed = new EmbedBuilder()
      .setTitle('Trade Request Sent')
      .setDescription(`Trade ID: ${t.id}\nFrom: <@${t.from_id}> → To: <@${t.to_id}>`)
      .addFields(
        { name: 'Your Offer', value: JSON.stringify(yourOffer), inline: true },
        { name: 'Their Offer (requested)', value: JSON.stringify(theirOffer), inline: true }
      )
      .setFooter({ text: `To accept: ${message.prefix || client.getPrefix(message.guild?.id)}tradeaccept ${t.id}  — To reject: tradereject ${t.id}` });

    return message.reply({ embeds: [embed] });
  }
};