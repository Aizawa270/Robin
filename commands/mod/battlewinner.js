const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const ARENA_CHANNEL_ID = '1453791150556319979';
const LOSER_MUTE_DURATION = 10 * 60 * 1000;

module.exports = {
  name: 'battlewinner',
  description: 'Declare the winner of a 1v1 battle.',
  category: 'mod',
  usage: '!battlewinner @user',

  async execute(client, message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('Admins only.');
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

    const winEmbed = new EmbedBuilder()
      .setColor('#34d399')
      .setDescription(`<@${winner.id}> defeated <@${loser.id}>`)
      .setTimestamp();

    await arena.send({ embeds: [winEmbed] });

    const muteEmbed = new EmbedBuilder()
      .setColor('#f87171')
      .setDescription(`<@${loser.id}> is muted for **10 minutes**.`);

    await arena.send({ embeds: [muteEmbed] });

    try {
      await loser.timeout(LOSER_MUTE_DURATION, 'Lost battle');
    } catch {}

    const fighters = [winner.id, loser.id];

    // 🔓 RESTORE CHANNEL ACCESS
    for (const channel of message.guild.channels.cache.values()) {
      if (!channel.isTextBased()) continue;

      for (const id of fighters) {
        await channel.permissionOverwrites.delete(id).catch(() => {});
      }
    }

    // 🧹 CLEAR ARENA PERMS
    for (const id of fighters) {
      await arena.permissionOverwrites.delete(id).catch(() => {});
    }

    // 🗑️ DELETE BATTLE
    client.battleDB
      .prepare('DELETE FROM ongoing_battles WHERE channel_id = ?')
      .run(ARENA_CHANNEL_ID);

    return message.reply('Battle ended.');
  },
};