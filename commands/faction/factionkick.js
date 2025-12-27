// commands/faction/factionkick.js
const { EmbedBuilder } = require('discord.js');
const factions = require('../../handlers/factions');

module.exports = {
  name: 'factionkick',
  aliases: ['fkick'],
  category: 'Faction',
  description: 'Kick a member from your faction (leader/coleader/vice).',
  usage: '$factionkick <@user|id>',
  async execute(client, message, args) {
    if (!args[0]) return message.reply('Usage: $factionkick <@user|id>');
    const target = message.mentions.users.first() || (await client.users.fetch(args[0]).catch(()=>null));
    if (!target) return message.reply('User not found.');

    const guildId = message.guild.id;
    const factionsList = factions.listFactions(guildId);

    let myFaction = null;
    for (const f of factionsList) {
      const member = factions.getMember(f.id, message.author.id);
      if (member && ['owner','coleader','vice'].includes(member.role)) { myFaction = f; break; }
    }
    if (!myFaction) return message.reply('You must be leader/coleader/vice to kick.');

    const targetMember = factions.getMember(myFaction.id, target.id);
    if (!targetMember) return message.reply('That user is not in your faction.');

    // leaders cannot be kicked except by owner
    if (targetMember.role === 'owner' && message.author.id !== myFaction.owner_id) {
      return message.reply('You cannot kick the owner.');
    }

    factions.removeMember(myFaction.id, target.id);
    return message.reply({ embeds: [ new (require('discord.js').EmbedBuilder)().setDescription(`Removed <@${target.id}> from **${myFaction.name}**`) ] });
  }
};