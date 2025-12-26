const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const ARENA_CHANNEL_ID = '1453791150556319979';
const LOSER_MUTE_DURATION = 10 * 60 * 1000; // 10 minutes

module.exports = {
  name: 'battlewinner',
  description: 'Declare the winner of a 1v1 battle.',
  category: 'mod',
  usage: '!battlewinner @user',
  aliases: [],
  async execute(client, message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Admins only. Don’t try it.');
    }

    const winner = message.mentions.members.first();
    if (!winner) return message.reply('Mention the winner.');

    const battle = client.battleDB
      .prepare('SELECT * FROM ongoing_battles WHERE channel_id = ?')
      .get(ARENA_CHANNEL_ID);

    if (!battle) {
      return message.reply('There is no ongoing battle.');
    }

    const loserId =
      battle.user1_id === winner.id ? battle.user2_id : battle.user1_id;

    const loser = await message.guild.members.fetch(loserId).catch(() => null);
    if (!loser) return message.reply('Loser not found.');

    const arena = await message.guild.channels.fetch(ARENA_CHANNEL_ID);

    // 🏆 WINNER EMBED
    const winEmbed = new EmbedBuilder()
      .setColor('#34d399')
      .setTitle('BATTLE OVER')
      .setDescription(`<@${winner.id}> absolutely folded <@${loser.id}>`)
      .setTimestamp();

    await arena.send({ embeds: [winEmbed] });

    // 🔇 LOSER EMBED
    const muteEmbed = new EmbedBuilder()
      .setColor('#f87171')
      .setDescription(`<@${loser.id}> is muted for **10 minutes**. Hold that L.`);

    await arena.send({ embeds: [muteEmbed] });

    // 🔕 TIMEOUT LOSER
    try {
      await loser.timeout(LOSER_MUTE_DURATION, 'Lost 1v1 battle');
    } catch (err) {
      console.error('Failed to mute loser:', err);
    }

    const fighters = [winner.id, loser.id];

    // 🔓 RESTORE ACCESS TO ALL CHANNELS
    for (const channel of message.guild.channels.cache.values()) {
      if (!channel.isTextBased()) continue;

      for (const userId of fighters) {
        await channel.permissionOverwrites.delete(userId).catch(() => {});
      }
    }

    // 🧹 CLEAN ARENA PERMS
    for (const userId of fighters) {
      await arena.permissionOverwrites.delete(userId).catch(() => {});
    }

    // 🗑️ REMOVE BATTLE FROM DB
    client.battleDB
      .prepare('DELETE FROM ongoing_battles WHERE channel_id = ?')
      .run(ARENA_CHANNEL_ID);

    return message.reply('Battle ended. Permissions restored.');
  },
};