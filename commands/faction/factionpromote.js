// commands/faction/factionpromote.js
const { EmbedBuilder } = require('discord.js');
const factions = require('../../handlers/factions');

module.exports = {
  name: 'factionpromote',
  aliases: ['fpromote'],
  category: 'Faction',
  description: 'Promote a member (to vice / coleader).',
  usage: '$factionpromote <@user|id> <vice|coleader>',
  async execute(client, message, args) {
    if (args.length < 2) return message.reply('Usage: $factionpromote <@user|id> <vice|coleader>');
    const target = message.mentions.users.first() || (await client.users.fetch(args[0]).catch(()=>null));
    const newRole = args[1]?.toLowerCase();
    if (!target) return message.reply('User not found.');
    if (!['vice','coleader'].includes(newRole)) return message.reply('Role must be vice or coleader.');

    const guildId = message.guild.id;
    const list = factions.listFactions(guildId);
    let myFaction = null;
    for (const f of list) {
      const member = factions.getMember(f.id, message.author.id);
      if (member && ['owner','coleader'].includes(member.role)) { myFaction = f; break; }
    }
    if (!myFaction) return message.reply('You must be owner/coleader to promote.');

    const targetMember = factions.getMember(myFaction.id, target.id);
    if (!targetMember) return message.reply('That user is not in your faction.');

    factions.promoteMember(myFaction.id, target.id, newRole === 'vice' ? 'vice' : 'coleader');
    return message.reply({ embeds: [ new (require('discord.js').EmbedBuilder)().setDescription(`Promoted <@${target.id}> to ${newRole} in **${myFaction.name}**`) ] });
  }
};