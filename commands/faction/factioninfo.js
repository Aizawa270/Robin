// commands/faction/factioninfo.js
const { EmbedBuilder } = require('discord.js');
const factions = require('../../handlers/factions');

module.exports = {
  name: 'factioninfo',
  aliases: ['finfo'],
  category: 'Faction',
  description: 'Show info about a faction by id or name.',
  usage: '$factioninfo <id|name>',
  async execute(client, message, args) {
    const guildId = message.guild?.id;
    if (!guildId) return message.reply('Server-only.');

    if (!args.length) return message.reply('Usage: $factioninfo <id|name>');
    const q = args.join(' ');

    let f = null;
    if (/^\d+$/.test(q)) f = factions.getFactionById(parseInt(q));
    if (!f) f = factions.getFactionByName(guildId, q);

    if (!f) return message.reply('Faction not found.');

    const members = factions.getMembers(f.id);
    const owner = await client.users.fetch(f.owner_id).catch(() => null);
    const vault = factions.getVault(f.id);

    const memberLines = members.slice(0, 20).map(m => {
      return `<@${m.user_id}> — ${m.role}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`${f.name}`)
      .setDescription(`${f.is_private ? 'Private' : 'Public'} faction`)
      .addFields(
        { name: 'Owner', value: owner ? owner.tag : f.owner_id, inline: true },
        { name: 'Members', value: `${members.length}`, inline: true },
        { name: 'Vault', value: `${vault} Vyncoins`, inline: true },
        { name: 'Member list (preview)', value: memberLines.join('\n') || 'No members' }
      );

    if (f.banner_url) embed.setImage(f.banner_url);
    return message.reply({ embeds: [embed] });
  }
};