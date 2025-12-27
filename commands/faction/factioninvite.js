// commands/faction/factioninvite.js
const { EmbedBuilder } = require('discord.js');
const factions = require('../../handlers/factions');

module.exports = {
  name: 'factioninvite',
  aliases: ['finvite'],
  category: 'Faction',
  description: 'Invite a user to your faction (leader/coleader/vice).',
  usage: '$factioninvite <@user|id>',
  async execute(client, message, args) {
    if (!message.guild) return;
    const target = message.mentions.users.first() || (args[0] && await client.users.fetch(args[0]).catch(() => null));
    if (!target) return message.reply('Please mention a user or provide an ID.');

    // find faction where author is owner/coleader/vice
    const guildId = message.guild.id;
    const factionsList = factions.listFactions(guildId);
    const authId = message.author.id;

    let myFaction = null;
    for (const f of factionsList) {
      const member = factions.getMember(f.id, authId);
      if (member && ['owner','coleader','vice'].includes(member.role)) { myFaction = f; break; }
    }
    if (!myFaction) return message.reply('You must be a faction leader/coleader/vice to invite.');

    // check if target is banned
    const mem = factions.getMember(myFaction.id, target.id);
    if (mem && mem.banned) return message.reply('This user is banned from your faction.');

    factions.createInvite(myFaction.id, target.id, message.author.id);

    const embed = new EmbedBuilder()
      .setTitle('Faction Invite Sent')
      .setDescription(`<@${target.id}> has been invited to **${myFaction.name}**.\nThey must run \`${message.prefix || client.getPrefix(message.guild?.id)}factionjoin ${myFaction.id}\` to accept.`);

    return message.reply({ embeds: [embed] });
  }
};