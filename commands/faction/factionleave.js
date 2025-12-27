// commands/faction/factionleave.js
const { EmbedBuilder } = require('discord.js');
const factions = require('../../handlers/factions');

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

module.exports = {
  name: 'factionleave',
  aliases: ['fleave'],
  category: 'Faction',
  description: 'Leave your faction (locked for 7 days after joining).',
  usage: '$factionleave',
  async execute(client, message, args) {
    const guildId = message.guild?.id;
    if (!guildId) return;

    // find the faction where user is member
    const list = factions.listFactions(guildId);
    let myFaction = null;
    let myMember = null;
    for (const f of list) {
      const m = factions.getMember(f.id, message.author.id);
      if (m && m.banned === 0) { myFaction = f; myMember = m; break; }
    }
    if (!myFaction) return message.reply('You are not in any faction.');

    if (myMember.role === 'owner') return message.reply('Owner cannot leave. Transfer ownership or delete faction.');

    const now = Date.now();
    if (now - myMember.joined_at < SEVEN_DAYS) {
      const rem = Math.ceil((SEVEN_DAYS - (now - myMember.joined_at)) / (60*60*1000));
      return message.reply(`You cannot leave yet. Wait ~${rem} hour(s).`);
    }

    factions.removeMember(myFaction.id, message.author.id);
    return message.reply({ embeds: [ new (require('discord.js').EmbedBuilder)().setDescription(`Successfully left **${myFaction.name}**`) ] });
  }
};