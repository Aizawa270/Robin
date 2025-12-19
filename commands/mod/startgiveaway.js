const { EmbedBuilder } = require('discord.js');

const GIVEAWAY_EMOJI = '🎉';

module.exports = {
  name: 'startgiveaway',
  aliases: ['sgw'],
  hidden: true,

  async execute(client, message, args) {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('Admins only.');
    }

    // ─── ARGS ─────────────────────────────────────────
    const name = args[0];
    const durationRaw = args[1];
    const winnerCount = parseInt(args[2]) || 1;

    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[3]) ||
      message.channel;

    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(args[4]) ||
      null;

    if (!name || !durationRaw) {
      return message.reply(
        'Usage: `$sgw <name> <duration> <winners> [channel] [role]`'
      );
    }

    // ─── DURATION ─────────────────────────────────────
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const match = durationRaw.match(/^(\d+)([smhd])$/);
    if (!match) return message.reply('Invalid duration. Example: `1h`, `7d`');

    const duration = parseInt(match[1]) * units[match[2]];
    if (duration < 5000 || duration > 14 * 86400000) {
      return message.reply('Duration must be between **5s and 14d**.');
    }

    const endTimestamp = Date.now() + duration;

    // ─── GIVEAWAY EMBED ───────────────────────────────
    const embed = new EmbedBuilder()
      .setColor('#22c55e')
      .setThumbnail(message.guild.iconURL({ dynamic: true }))
      .setDescription(
        [
          '「 ✦ 𝐈𝐍𝐅𝐎𝐑𝐌𝐀𝐓𝐈𝐎𝐍 ✦ 」',
          '',
          `➤  **Prize:** \`\`${name}\`\``,
          `➤  **Winners:** \`\`${winnerCount}\`\``,
          `➤  **Draw:** <t:${Math.floor(endTimestamp / 1000)}:R>`,
          '',
          `╰┈➤ **__Requirements:__** ${role ? role.toString() : '\`\`none\`\`'}`,
          '',
          `\`${GIVEAWAY_EMOJI}\` **𝓒𝓵𝓲𝓬𝓴 𝓸𝓷 𝓽𝓱𝓮 __𝓫𝓾𝓽𝓽𝓸𝓷__ 𝓽𝓸 𝓹𝓪𝓻𝓽𝓲𝓬𝓲𝓹𝓪𝓽𝓮.**`,
        ].join('\n')
      )
      .setTimestamp();

    const gwMessage = await channel.send({ embeds: [embed] });
    await gwMessage.react(GIVEAWAY_EMOJI);

    // ─── SAVE TO DB ───────────────────────────────────
    client.giveawayDB
      .prepare(
        `INSERT INTO giveaways 
        (message_id, channel_id, name, winner_count, end_timestamp) 
        VALUES (?, ?, ?, ?, ?)`
      )
      .run(gwMessage.id, channel.id, name, winnerCount, endTimestamp);

    // ─── END TIMER ────────────────────────────────────
    setTimeout(
      () => module.exports.endGiveaway(client, gwMessage.id),
      duration
    );
  },

  // ───────────────────────────────────────────────────
  async endGiveaway(client, messageId) {
    const g = client.giveawayDB
      .prepare('SELECT * FROM giveaways WHERE message_id = ?')
      .get(messageId);
    if (!g) return;

    const channel = await client.channels.fetch(g.channel_id);
    const msg = await channel.messages.fetch(messageId);

    const reaction = msg.reactions.cache.get(GIVEAWAY_EMOJI);
    if (!reaction) return;

    const users = await reaction.users.fetch();
    let participants = users.filter(u => !u.bot);

    // Role requirement check
    const roleMentionMatch = msg.embeds[0]?.description?.match(/<@&(\d+)>/);
    if (roleMentionMatch) {
      const roleId = roleMentionMatch[1];
      participants = participants.filter(u => {
        const m = channel.guild.members.cache.get(u.id);
        return m && m.roles.cache.has(roleId);
      });
    }

    if (!participants.size) {
      await channel.send(`Giveaway **${g.name}** ended with no valid participants.`);
      client.giveawayDB.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);
      return;
    }

    // ─── PICK WINNERS ─────────────────────────────────
    const pool = Array.from(participants.keys());
    const winners = [];

    while (winners.length < g.winner_count && pool.length) {
      const index = Math.floor(Math.random() * pool.length);
      winners.push(pool.splice(index, 1)[0]);
    }

    const mentions = winners.map(id => `<@${id}>`).join(', ');

    // ─── WINNER EMBED ─────────────────────────────────
    const winEmbed = new EmbedBuilder()
      .setColor('#facc15')
      .setThumbnail(channel.guild.iconURL({ dynamic: true }))
      .setDescription(
        [
          '────⋆⋅☆⋅⋆────────⋆⋅✦⋅⋆────────⋆⋅☆⋅⋆────',
          `\`${GIVEAWAY_EMOJI}\` ➤ ***Congratulations!*** The **winner** of the giveaway is`,
          `⤷ ${mentions}`,
        ].join('\n')
      )
      .setTimestamp();

    await channel.send({ content: mentions, embeds: [winEmbed] });

    // ─── DM WINNERS ───────────────────────────────────
    for (const id of winners) {
      try {
        const user = await client.users.fetch(id);
        await user.send(`🎉 You have successfully won the **${g.name}** giveaway!`);
      } catch {
        // DMs closed, skill issue
      }
    }

    // ─── CLEANUP ──────────────────────────────────────
    client.giveawayDB.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);
  },
};