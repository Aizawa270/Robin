const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '../data/giveaways.sqlite');
const db = new Database(dbPath);

db.prepare(`
  CREATE TABLE IF NOT EXISTS giveaways (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT,
    name TEXT,
    winner_count INTEGER,
    end_timestamp INTEGER
  )
`).run();

module.exports = {
  name: 'startgiveaway',
  aliases: ['sg', 'sgw'],
  category: 'utility',
  hidden: true, // won't show in help
  usage: '$startgiveaway <name> <duration> <winners> [#channel]',
  async execute(client, message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild))
      return message.reply('You need the **Manage Server** permission.');

    if (args.length < 3) return message.reply('Usage: $sgw <name> <duration> <winners> [#channel]');

    const name = args[0];
    const durationRaw = args[1];
    const winnerCount = parseInt(args[2]);
    if (isNaN(winnerCount) || winnerCount < 1) return message.reply('Winner count must be a number ≥ 1');

    // parse duration
    const duration = parseDuration(durationRaw);
    if (!duration) return message.reply('Invalid duration format. Example: 10s, 5m, 2h, 7d');

    // target channel
    let channel = message.mentions.channels.first() || message.channel;

    // build embed
    const embed = new EmbedBuilder()
      .setTitle(name)
      .setColor('Purple')
      .setThumbnail(message.guild.iconURL({ dynamic: true }))
      .addFields(
        { name: 'Winners', value: `${winnerCount}`, inline: true },
        { name: 'Duration', value: durationRaw, inline: true }
      )
      .setFooter({ text: 'React with 🎉 to enter!' })
      .setTimestamp();

    const giveawayMsg = await channel.send({ embeds: [embed] });
    await giveawayMsg.react('🎉');

    // save to DB
    const endTime = Date.now() + duration;
    db.prepare('INSERT OR REPLACE INTO giveaways (message_id, channel_id, name, winner_count, end_timestamp) VALUES (?, ?, ?, ?, ?)')
      .run(giveawayMsg.id, channel.id, name, winnerCount, endTime);

    // schedule automatic end
    scheduleEnd(client, giveawayMsg.id, endTime);

    message.reply(`Giveaway started in ${channel}`);
  },
};

// ------------------ HELPERS ------------------

function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function scheduleEnd(client, messageId, endTime) {
  const delay = endTime - Date.now();
  if (delay <= 0) return endGiveaway(client, messageId);
  setTimeout(() => endGiveaway(client, messageId), delay);
}

async function endGiveaway(client, messageId) {
  const row = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
  if (!row) return;

  const channel = client.channels.cache.get(row.channel_id);
  if (!channel) return db.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);

  const msg = await channel.messages.fetch(row.message_id).catch(() => null);
  if (!msg) return db.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);

  // get participants from reactions
  const reaction = msg.reactions.cache.get('🎉');
  if (!reaction) return db.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);

  const users = (await reaction.users.fetch()).filter(u => !u.bot);
  if (users.size === 0) {
    msg.edit({ embeds: [new EmbedBuilder().setTitle(row.name).setColor('Grey').setDescription('No participants!')] });
    return db.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);
  }

  // pick winners
  const shuffled = [...users.values()].sort(() => 0.5 - Math.random());
  const winners = shuffled.slice(0, row.winner_count);

  const winnersMentions = winners.map(u => `<@${u.id}>`).join(', ');

  const winEmbed = new EmbedBuilder()
    .setTitle(row.name)
    .setColor('Green')
    .setDescription(`${winnersMentions} won **${row.name}** 🎉`)
    .setThumbnail(msg.guild.iconURL({ dynamic: true }));

  await msg.edit({ embeds: [winEmbed] });

  db.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);
}