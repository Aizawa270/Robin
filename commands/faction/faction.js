// commands/faction/faction.js
const { EmbedBuilder } = require('discord.js');
const factions = require('../../handlers/factions');

module.exports = {
  name: 'faction',
  aliases: ['factions'],
  category: 'Faction',
  description: 'List factions on this server or show help.',
  usage: '$faction',
  async execute(client, message, args) {
    const guildId = message.guild?.id;
    if (!guildId) return message.reply('This command only works in servers.');

    const list = factions.listFactions(guildId);
    if (!list.length) return message.reply('No factions exist yet.');

    const lines = list.map(f => {
      return `**${f.name}** — id: \`${f.id}\` — ${f.is_private ? 'Private' : 'Public'}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Factions')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Use ${message.prefix || client.getPrefix(message.guild?.id)}factioninfo <id|name>` });

    return message.reply({ embeds: [embed] });
  }
};