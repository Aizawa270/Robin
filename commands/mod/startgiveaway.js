const { EmbedBuilder } = require('discord.js');

const GIVEAWAY_EMOJI = '🎉';

module.exports = {
  name: 'startgiveaway',
  aliases: ['sgw'],
  hidden: true,

  async execute(client, message, args) {
    if (!message.member.permissions.has('Administrator')) return message.reply('Admins only.');
    if (!args.length) return message.reply('Usage: `$sgw <name> <duration> <winners> [channel] [role]`');

    // ─── PARSE ARGS ────────────────────────────────
    // Work backwards: last args are role, channel, winners, duration
    let role = null;
    let channel = message.channel;
    let winnerCount = 1;
    let durationRaw;

    // Check for role mention or ID
    if (message.mentions.roles.size) {
      role = message.mentions.roles.first();
      args = args.filter(a => !/<@&\d+>/.test(a));
    } else if (args.length && message.guild.roles.cache.has(args[args.length - 1])) {
      role = message.guild.roles.cache.get(args[args.length - 1]);
      args.pop();
    }

    // Check for channel mention or ID
    if (message.mentions.channels.size) {
      channel = message.mentions.channels.first();
      args = args.filter(a => !/<#\d+>/.test(a));
    } else if (args.length && message.guild.channels.cache.has(args[args.length - 1])) {
      channel = message.guild.channels.cache.get(args[args.length - 1]);
      args.pop();
    }

    // Winner count
    if (args.length && /^\d+$/.test(args[args.length - 1])) {
      winnerCount = parseInt(args.pop());
    }

    // Duration
    if (args.length && /^\d+[smhd]$/.test(args[args.length - 1])) {
      durationRaw = args.pop();
    } else {
      return message.reply('Invalid duration. Example: `1h`, `7d`');
    }

    // Remaining args = prize name
    const name = args.join(' ');
    if (!name) return message.reply('You need to provide a giveaway name.');

    // ─── PARSE DURATION ────────────────────────────
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const match = durationRaw.match(/^(\d+)([smhd])$/);
    if (!match) return message.reply('Invalid duration format. Use `1h`, `7d` etc.');

    const duration = parseInt(match[1]) * units[match[2]];
    if (duration < 5000 || duration > 14 * 86400000)
      return message.reply('Duration must be between **5s and 14d**.');

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
          `╰┈➤ **__Requirements:__** ${role ? role.toString() : 'none'}`,
          '',
          `\`${GIVEAWAY_EMOJI}\` **Click the button to participate.**`,
        ].join('\n')
      )
      .setTimestamp();

    const gwMessage = await channel.send({ embeds: [embed] });
    await gwMessage.react(GIVEAWAY_EMOJI);

    // ─── SAVE TO DB ───────────────────────────────────
    client.giveawayDB
      .prepare(
        `INSERT INTO giveaways (message_id, channel_id, name, winner_count, end_timestamp) 
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(gwMessage.id, channel.id, name, winnerCount, endTimestamp);

    // ─── END TIMER ────────────────────────────────────
    setTimeout(() => module.exports.endGiveaway(client, gwMessage.id), duration);
  },

  // ───────────────────────────────────────────────────
  async endGiveaway(client, messageId) {
    const g = client.giveawayDB.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId);
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
      } catch {}
    }

    // ─── CLEANUP ──────────────────────────────────────
    client.giveawayDB.prepare('DELETE FROM giveaways WHERE message_id = ?').run(messageId);
  },
};