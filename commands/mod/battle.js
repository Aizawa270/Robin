const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const ARENA_CHANNEL_ID = '1453791150556319979';
const BATTLE_ANNOUNCE_ROLE = '1437440501702721547';

module.exports = {
  name: 'battle',
  description: 'Start a 1v1 battle between two users.',
  category: 'mod',
  usage: '!battle @user1 @user2',
  aliases: [],

  async execute(client, message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Admins only.');
    }

    const mentions = [...message.mentions.users.values()];
    if (mentions.length !== 2) {
      return message.reply('Mention exactly **2 users**.');
    }

    const [user1, user2] = mentions;
    const fighters = [user1.id, user2.id];

    const arena = await message.guild.channels.fetch(ARENA_CHANNEL_ID).catch(() => null);
    if (!arena || arena.type !== ChannelType.GuildText) {
      return message.reply('Arena channel is invalid.');
    }

    // ❌ block existing battle
    const existing = client.battleDB
      .prepare('SELECT * FROM ongoing_battles WHERE channel_id = ?')
      .get(ARENA_CHANNEL_ID);

    if (existing) {
      return message.reply('There is already an ongoing battle.');
    }

    // ✅ insert battle FIRST
    client.battleDB.prepare(`
      INSERT INTO ongoing_battles (channel_id, user1_id, user2_id, start_timestamp)
      VALUES (?, ?, ?, ?)
    `).run(ARENA_CHANNEL_ID, user1.id, user2.id, Date.now());

    try {
      // 🔒 LOCK fighters out of all OTHER TEXT CHANNELS
      for (const channel of message.guild.channels.cache.values()) {
        if (channel.type !== ChannelType.GuildText) continue;
        if (channel.id === arena.id) continue;

        for (const id of fighters) {
          await channel.permissionOverwrites.edit(id, {
            ViewChannel: false,
          });
        }
      }

      // 🔓 Arena perms
      await arena.permissionOverwrites.edit(message.guild.roles.everyone, {
        ViewChannel: true,
        SendMessages: false,
      });

      for (const id of fighters) {
        await arena.permissionOverwrites.edit(id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
      }

    } catch (err) {
      // 🧹 HARD ROLLBACK
      console.error('Battle setup failed:', err);

      client.battleDB
        .prepare('DELETE FROM ongoing_battles WHERE channel_id = ?')
        .run(ARENA_CHANNEL_ID);

      return message.reply('Battle failed to start. Permissions issue.');
    }

    // 📣 ANNOUNCE
    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setDescription(`<@${user1.id}> vs <@${user2.id}>`)
      .setFooter({ text: 'They are locked in.' })
      .setTimestamp();

    await arena.send({
      content: `<@&${BATTLE_ANNOUNCE_ROLE}>`,
      embeds: [embed],
    });

    return message.reply('Battle started.');
  },
};