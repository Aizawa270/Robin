// commands/faction/startfaction.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const factions = require('../../handlers/factions');

const LEADER_ROLE_ID = '1447894643277561856'; // allowed role to create public factions

module.exports = {
  name: 'startfaction',
  aliases: ['createfaction'],
  category: 'Faction',
  description: 'Create a public faction. Role required to run this.',
  usage: '$startfaction <name> [bannerUrl]',
  async execute(client, message, args) {
    if (!message.guild) return message.reply('Server-only.');
    const author = message.member;
    if (!author.roles.cache.has(LEADER_ROLE_ID) && !author.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You do not have permission to create factions.');
    }

    const name = args[0];
    if (!name) return message.reply('Usage: $startfaction <name> [bannerUrl]');

    const guildId = message.guild.id;
    if (factions.getFactionByName(guildId, name)) return message.reply('A faction with that name already exists.');

    const banner = args[1] || null;
    const f = factions.createFaction(guildId, name, message.author.id, 0, banner);

    const embed = new EmbedBuilder()
      .setTitle('Faction created')
      .setDescription(`Successfully created faction **${f.name}** (id: ${f.id})`);
    if (banner) embed.setImage(banner);

    return message.reply({ embeds: [embed] });
  }
};