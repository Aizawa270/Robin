const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../data');
const giveawayDB = new Database(path.join(DATA_DIR, 'giveaways.sqlite'));

module.exports = {
  name: 'startgiveaway',
  aliases: ['sgw'],
  description: 'Start a giveaway. Usage: $startgiveaway <name> <duration> <winners> [channel]',
  category: 'utility',
  hidden: true, // Not shown in help
  async execute(client, message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply('You need Manage Messages permission to start giveaways.');
    }

    const name = args[0];
    const durationInput = args[1];
    const winnersCount = parseInt(args[2]) || 1;
    let channel = message.channel;

    if (!name || !durationInput) return message.reply('Usage: $startgiveaway <name> <duration> <winners> [channel]');

    if (args[3]) {
      const ch = message.guild.channels.cache.get(args[3].replace(/[<#>]/g, ''));
      if (ch) channel = ch;
    }

    // Convert duration like 10s, 5m, 2h, 7d
    const durationMs = parseDuration(durationInput);
    if (!durationMs) return message.reply('Invalid duration format. Examples: 10s, 5m, 2h, 7d');

    const embed = new EmbedBuilder()
      .setTitle(name)
      .setColor('#f59e0b')
      .setDescription(`Winners: ${winnersCount}\nDuration: ${durationInput}`)
      .setThumbnail(message.guild.iconURL({ dynamic: true }))
      .setFooter({ text: 'React with 🎉 to enter!' });

    const gwMessage = await channel.send({ embeds: [embed] });
    await gwMessage.react('🎉');

    // Save to DB
    giveawayDB.prepare(`
      INSERT OR REPLACE INTO giveaways (message_id, channel_id, name, winner_count, end_timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(gwMessage.id, channel.id, name, winnersCount, Date.now() + durationMs);

    // Schedule end
    setTimeout(() => module.exports.endGiveaway(client, gwMessage.id), durationMs);

    message.reply(`Giveaway "${name}" started in ${channel}!`);
  },

  // End giveaway helper
  async endGiveaway(client, messageId) {
    const row = giveawayDB.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
    if (!row) return;

    const channel = await client.channels.fetch(row.channel_id).catch(() => null);
    if (!channel) return giveawayDB.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);

    const message = await channel.messages.fetch(row.message_id).catch(() => null);
    if (!message) return giveawayDB.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);

    const users = (await message.reactions.cache.get('🎉')?.users.fetch()).filter(u => !u.bot).map(u => u);
    if (users.length === 0) {
      const noWinnerEmbed = new EmbedBuilder()
        .setTitle(row.name)
        .setColor('#f87171')
        .setDescription('No participants, no winners.')
        .setThumbnail(channel.guild.iconURL({ dynamic: true }));
      return message.edit({ embeds: [noWinnerEmbed] });
    }

    // Pick winners randomly
    const winners = [];
    while (winners.length < row.winner_count && users.length > 0) {
      const index = Math.floor(Math.random() * users.length);
      winners.push(users[index]);
      users.splice(index, 1);
    }

    const winnerMentions = winners.map(u => `<@${u.id}>`).join(', ');

    const winEmbed = new EmbedBuilder()
      .setTitle(row.name)
      .setColor('#34d399')
      .setDescription(`🎉 Winner${winners.length > 1 ? 's' : ''}: ${winnerMentions}`)
      .setThumbnail(channel.guild.iconURL({ dynamic: true }));

    await message.edit({ embeds: [winEmbed] });

    // Notify winners
    winners.forEach(u => u.send(`You won the giveaway: **${row.name}** in **${channel.guild.name}**!`).catch(() => {}));

    giveawayDB.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);
  }
};

// Utility: parse duration string like 10s, 5m, 2h, 7d
function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const n = parseInt(match[1]);
  switch (match[2]) {
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'd': return n * 24 * 60 * 60 * 1000;
  }
  return null;
}