// commands/faction/factionjoin.js
const { EmbedBuilder } = require('discord.js');
const factions = require('../../handlers/factions');

module.exports = {
  name: 'factionjoin',
  aliases: ['fjoin'],
  category: 'Faction',
  description: 'Join a public faction or accept an invite.',
  usage: '$factionjoin <id>',
  async execute(client, message, args) {
    if (!message.guild) return;
    if (!args[0]) return message.reply('Usage: $factionjoin <id>');

    const factionId = parseInt(args[0]);
    if (!factionId) return message.reply('Invalid faction id.');

    const f = factions.getFactionById(factionId);
    if (!f) return message.reply('Faction not found.');

    // check if banned
    const memCheck = factions.getMember(factionId, message.author.id);
    if (memCheck && memCheck.banned) return message.reply('You are banned from this faction.');

    if (f.is_private) {
      // must have an invite
      const inv = factions.getInvite(factionId, message.author.id);
      if (!inv) return message.reply('This is a private faction. You need an invite.');
      // delete invite after accept
      factions.deleteInvite(factionId, message.author.id);
    }

    // add member and set joined_at
    factions.addMember(factionId, message.author.id, 'member');

    const embed = new EmbedBuilder()
      .setTitle('Joined Faction')
      .setDescription(`You joined **${f.name}**. You cannot leave for 7 days.`);
    return message.reply({ embeds: [embed] });
  }
};