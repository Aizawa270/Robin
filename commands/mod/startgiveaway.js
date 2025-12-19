const { EmbedBuilder } = require('discord.js');

const GIVEAWAY_EMOJI = '🎉';

module.exports = {
  name: 'startgiveaway',
  aliases: ['sgw', 'sg'],
  hidden: true, // stays out of help
  async execute(client, message, args) {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('You are not allowed to start giveaways.');
    }

    const name = args[0];
    const durationRaw = args[1];
    const winnerCount = parseInt(args[2]) || 1;
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[3]) ||
      message.channel;

    if (!name || !durationRaw) {
      return message.reply('Usage: `$sgw <prize> <duration> <winners> [channel]`');
    }

    // duration parsing
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const match = durationRaw.match(/^(\d+)([smhd])$/);
    if (!match) {
      return message.reply('Invalid duration. Example: `30s`, `5m`, `2h`, `7d`');
    }

    const duration = parseInt(match[1]) * units[match[2]];
    if (duration > 14 * 86400000) {
      return message.reply('Max giveaway duration is **14 days**.');
    }

    const endTimestamp = Date.now() + duration;
    const unixEnd = Math.floor(endTimestamp / 1000);

    // ===== GIVEAWAY EMBED =====
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setThumbnail(message.guild.iconURL({ dynamic: true }))
      .setDescription(
`「 ✦ 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍 ✦ 」

➤  **Prize:** \`${name}\`
➤  **Winners:** \`${winnerCount}\`
➤  **Draw:** <t:${unixEnd}:R>

╰┈➤ **__Requirements:__** \`none\`

\`\`${GIVEAWAY_EMOJI}\`\` **𝓒𝓵𝓲𝓬𝓴 𝓸𝓷 𝓽𝓱𝓮 𝓮𝓶𝓸𝓳𝓲 𝓽𝓸 𝓹𝓪𝓻𝓽𝓲𝓬𝓲𝓹𝓪𝓽𝓮.**`
      );

    const gwMsg = await channel.send({ embeds: [embed] });
    await gwMsg.react(GIVEAWAY_EMOJI);

    // persist giveaway
    client.giveawayDB.prepare(
      `INSERT OR REPLACE INTO giveaways 
       (message_id, channel_id, name, winner_count, end_timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(gwMsg.id, channel.id, name, winnerCount, endTimestamp);

    // memory map (needed for runtime)
    if (!client.giveaways) client.giveaways = new Map();
    client.giveaways.set(gwMsg.id, true);

    // schedule end
    setTimeout(() => {
      module.exports.endGiveaway(client, gwMsg.id);
    }, duration);
  },

  async endGiveaway(client, messageId) {
    const g = client.giveawayDB
      .prepare('SELECT * FROM giveaways WHERE message_id = ?')
      .get(messageId);
    if (!g) return;

    const channel = await client.channels.fetch(g.channel_id).catch(() => null);
    if (!channel) return;

    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) return;

    const reaction = msg.reactions.cache.get(GIVEAWAY_EMOJI);
    if (!reaction) {
      await channel.send(`Giveaway **${g.name}** ended with no participants.`);
      return;
    }

    const users = await reaction.users.fetch();
    const participants = users.filter(u => !u.bot).map(u => u.id);

    if (!participants.length) {
      await channel.send(`Giveaway **${g.name}** ended with no participants.`);
      return;
    }

    // pick winners
    const winners = [];
    const pool = [...participants];

    while (winners.length < g.winner_count && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      winners.push(pool.splice(i, 1)[0]);
    }

    const mentions = winners.map(id => `<@${id}>`).join(', ');

    // ===== WINNER EMBED =====
    const winEmbed = new EmbedBuilder()
      .setColor('#facc15')
      .setThumbnail(channel.guild.iconURL({ dynamic: true }))
      .setDescription(
`────⋆⋅☆⋅⋆────────⋆⋅✦⋅⋆────────⋆⋅☆⋅⋆────
\`\`🎉\`\` ➤ ***Congratulations!*** The **winner** of the giveaway is
⤷ ${mentions}`
      );

    await channel.send({
      content: mentions, // ACTUAL PING
      embeds: [winEmbed],
    });

    // cleanup
    client.giveawayDB
      .prepare('DELETE FROM giveaways WHERE message_id = ?')
      .run(messageId);

    if (client.giveaways) client.giveaways.delete(messageId);
  },
};