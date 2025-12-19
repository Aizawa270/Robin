const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'startgiveaway',
  aliases: ['sgw'],
  hidden: true, // Not in help
  async execute(client, message, args) {
    const name = args[0];
    const durationRaw = args[1]; // e.g., "7d", "1h", "30s"
    const winnerCount = parseInt(args[2]) || 1;
    const channel = message.mentions.channels.first() || message.channel;

    if (!name || !durationRaw) return message.reply('Usage: $sgw <name> <duration> <winners> [channel]');

    // Parse duration
    const timeUnits = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    const match = durationRaw.match(/^(\d+)([smhd])$/);
    if (!match) return message.reply('Invalid duration format! Example: 7d, 1h, 30s');
    const duration = parseInt(match[1]) * timeUnits[match[2]];

    const endTimestamp = Date.now() + duration;

    // Giveaway embed
    const embed = new EmbedBuilder()
      .setTitle(name)
      .setColor('Green')
      .setThumbnail(message.guild.iconURL())
      .setDescription(`Winners: ${winnerCount}\nDuration: ${durationRaw}\nReact with 🎉 to enter!`);

    const gwMsg = await channel.send({ embeds: [embed] });
    await gwMsg.react('🎉');

    // Store in DB
    client.giveawayDB.prepare('INSERT OR REPLACE INTO giveaways (message_id, channel_id, name, winner_count, end_timestamp) VALUES (?,?,?,?,?)')
      .run(gwMsg.id, channel.id, name, winnerCount, endTimestamp);

    client.giveaways.set(gwMsg.id, { participants: new Set() });

    // Schedule end
    setTimeout(() => module.exports.endGiveaway(client, gwMsg.id), duration);
  },

  async endGiveaway(client, messageId) {
    const g = client.giveawayDB.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
    if (!g) return;

    const participants = client.giveaways.get(messageId)?.participants || new Set();
    if (!participants.size) {
      const channel = await client.channels.fetch(g.channel_id);
      return channel.send(`Giveaway **${g.name}** ended with no participants.`);
    }

    // Pick winners
    const arr = Array.from(participants);
    const winners = [];
    while (winners.length < g.winner_count && arr.length) {
      const idx = Math.floor(Math.random() * arr.length);
      winners.push(arr.splice(idx, 1)[0]);
    }

    // Announce
    const channel = await client.channels.fetch(g.channel_id);
    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

    const embed = new EmbedBuilder()
      .setTitle(g.name)
      .setColor('Gold')
      .setThumbnail(channel.guild.iconURL())
      .setDescription(`Winner${winners.length > 1 ? 's' : ''}: ${winnerMentions}\nGiveaway has ended!`);

    await channel.send({ content: winnerMentions, embeds: [embed] });

    // Cleanup
    client.giveawayDB.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);
    client.giveaways.delete(messageId);
  },
};