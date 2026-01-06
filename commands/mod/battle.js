const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const ARENA_CHANNEL_ID = '1453791150556319979';
const BATTLE_ANNOUNCE_ROLE = '1437440501702721547';

module.exports = {
  name: 'battle',
  description: 'Start a 1v1 battle between two users.',
  category: 'mod',
  usage: '!battle @user1 @user2',

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

    const existing = client.battleDB
      .prepare('SELECT 1 FROM ongoing_battles WHERE channel_id = ?')
      .get(ARENA_CHANNEL_ID);

    if (existing) {
      return message.reply('There is already an ongoing battle.');
    }

    client.battleDB.prepare(`
      INSERT INTO ongoing_battles (channel_id, user1_id, user2_id, start_timestamp)
      VALUES (?, ?, ?, ?)
    `).run(ARENA_CHANNEL_ID, user1.id, user2.id, Date.now());

    try {
      const textChannels = message.guild.channels.cache.filter(
        c => c.type === ChannelType.GuildText && c.id !== arena.id
      );

      // 🔒 lock fighters everywhere else (parallel)
      await Promise.all(
        textChannels.flatMap(ch =>
          fighters.map(id =>
            ch.permissionOverwrites.edit(id, { ViewChannel: false })
          )
        )
      );

      // 🔓 arena perms
      await arena.permissionOverwrites.edit(message.guild.roles.everyone, {
        ViewChannel: true,
        SendMessages: false,
      });

      await Promise.all(
        fighters.map(id =>
          arena.permissionOverwrites.edit(id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          })
        )
      );

    } catch (err) {
      console.error('Battle setup failed:', err);
      client.battleDB
        .prepare('DELETE FROM ongoing_battles WHERE channel_id = ?')
        .run(ARENA_CHANNEL_ID);

      return message.reply('Battle failed to start. Permissions issue.');
    }

    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setDescription(`<@${user1.id}> vs <@${user2.id}>`)
      .setFooter({ text: 'They are locked in.' })
      .setTimestamp();

    await arena.send({
      content: `<@&${BATTLE_ANNOUNCE_ROLE}>`,
      embeds: [embed],
    });

    await message.reply('Battle started.');
  },
};