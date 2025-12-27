// commands/faction/startfactionpriv.js
const { EmbedBuilder } = require('discord.js');
const factions = require('../../handlers/factions');

const DEVELOPER_ID = '852839588689870879';

module.exports = {
  name: 'startfactionpriv',
  aliases: [],
  category: 'Faction',
  description: 'Owner-only: create a private faction (one-time).',
  usage: '$startfactionpriv <name> [bannerUrl]',
  async execute(client, message, args) {
    if (message.author.id !== DEVELOPER_ID) return;
    const name = args[0];
    if (!name) return message.reply('Usage: $startfactionpriv <name> [bannerUrl]');

    const guildId = message.guild.id;

    // check if any private started by owner already
    const existing = factions.listFactions(guildId).find(f => f.owner_id === DEVELOPER_ID && f.is_private);
    if (existing) return message.reply('You already started a private faction here.');

    const banner = args[1] || null;
    const f = factions.createFaction(guildId, name, message.author.id, 1, banner);

    const embed = new EmbedBuilder()
      .setTitle('Private Faction Created')
      .setDescription(`Private faction **${f.name}** created.`);

    if (banner) embed.setImage(banner);
    return message.reply({ embeds: [embed] });
  }
};