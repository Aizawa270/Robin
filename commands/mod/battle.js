const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const ARENA_CHANNEL_ID = '1453791150556319979';
const BATTLE_ANNOUNCE_ROLE = '1437440501702721547';

// 30 minutes max per battle
const BATTLE_TIMEOUT = 30 * 60 * 1000;

module.exports = {
  name: 'battle',
  description: 'Start a 1v1 battle between two users.',
  category: 'mod',
  usage: '!battle @user1 @user2',

  async execute(client, message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Admins only.');
    }

    const mentions = message.mentions.users;
    if (mentions.size !== 2) {
      return message.reply('Mention exactly **2 users**.');
    }

    const [user1, user2] = mentions.map(u => u);
    const fighters = [user1.id, user2.id];

    const arena = await message.guild.channels.fetch(ARENA_CHANNEL_ID).catch(() => null);
    if (!arena) return message.reply('Arena channel not found.');

    const now = Date.now();

    // 🔥 CLEAN STUCK / EXPIRED BATTLES
    const existing = client.battleDB
      .prepare('SELECT * FROM ongoing_battles WHERE channel_id = ?')
      .get(ARENA_CHANNEL_ID);

    if (existing) {
      const expired = now - existing.start_timestamp > BATTLE_TIMEOUT;

      if (!expired) {
        return message.reply('There is already an ongoing battle.');
      }

      // force cleanup if expired
      client.battleDB
        .prepare('DELETE FROM ongoing_battles WHERE channel_id = ?')
        .run(ARENA_CHANNEL_ID);
    }

    // ✅ SAVE NEW BATTLE
    client.battleDB.prepare(`
      INSERT INTO ongoing_battles (channel_id, user1_id, user2_id, start_timestamp)
      VALUES (?, ?, ?, ?)
    `).run(ARENA_CHANNEL_ID, user1.id, user2.id, now);

    // 🔒 LOCK FIGHTERS OUT OF OTHER CHANNELS
    for (const channel of message.guild.channels.cache.values()) {
      if (!channel.isTextBased()) continue;
      if (channel.id === arena.id) continue;

      for (const id of fighters) {
        await channel.permissionOverwrites.edit(id, {
          ViewChannel: false,
        }).catch(() => {});
      }
    }

    // 🔓 ARENA PERMS
    await arena.permissionOverwrites.set([
      {
        id: message.guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages],
      },
    ]);

    for (const id of fighters) {
      await arena.permissionOverwrites.edit(id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle('BATTLE STARTED')
      .setDescription(`<@${user1.id}> vs <@${user2.id}>`)
      .setTimestamp();

    await arena.send({
      content: `<@&${BATTLE_ANNOUNCE_ROLE}>`,
      embeds: [embed],
    });

    return message.reply('Battle started.');
  },
};