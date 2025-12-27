// commands/faction/factionvault.js
const { EmbedBuilder } = require('discord.js');
const factions = require('../../handlers/factions');
const econ = require('../../handlers/economy');

module.exports = {
  name: 'factionvault',
  aliases: ['fvault'],
  category: 'Faction',
  description: 'Contribute to or view faction vault: $factionvault view | $factionvault contribute <amount>',
  usage: '$factionvault <view|contribute> [amount]',
  async execute(client, message, args) {
    if (!message.guild) return;
    const sub = (args[0] || 'view').toLowerCase();

    // find faction of author
    const guildId = message.guild.id;
    let myFaction = null;
    for (const f of factions.listFactions(guildId)) {
      const member = factions.getMember(f.id, message.author.id);
      if (member && member.banned === 0) { myFaction = f; break; }
    }
    if (!myFaction) return message.reply('You are not in a faction.');

    if (sub === 'view') {
      const total = factions.getVault(myFaction.id);
      return message.reply({ embeds: [ new (require('discord.js').EmbedBuilder)().setTitle(`${myFaction.name} Vault`).setDescription(`${total} Vyncoins`) ] });
    }

    if (sub === 'contribute') {
      const amount = parseInt(args[1]);
      if (!amount || amount <= 0) return message.reply('Invalid amount.');
      const user = econ.getUser(message.author.id);
      if ((user.wallet || 0) < amount) return message.reply('Insufficient wallet funds.');

      // subtract from wallet & add to vault
      econ.addWallet(message.author.id, -amount);
      factions.contributeVault(myFaction.id, amount);
      econ.addLifetimeLost(message.author.id, amount); // optional if you want logging
      return message.reply({ embeds: [ new (require('discord.js').EmbedBuilder)().setDescription(`Contributed ${amount} Vyncoins to **${myFaction.name}** vault.`) ] });
    }

    return message.reply('Usage: $factionvault view | $factionvault contribute <amount>');
  }
};