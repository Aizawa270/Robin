const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ARENA_CHANNEL_ID = '1453791150556319979';
const LOSER_MUTE_DURATION = 10 * 60 * 1000; // 10 mins

module.exports = {
  name: 'battlewinner',
  description: 'Declare the winner of a 1v1 battle.',
  category: 'mod',
  usage: '!battlewinner @user',
  aliases: [],
  async execute(client, message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('Only administrators can end battles.');

    const winner = message.mentions.members.first();
    if (!winner) return message.reply('Please mention the winner.');

    const battle = client.battleDB.prepare('SELECT * FROM ongoing_battles WHERE channel_id = ?')
      .get(ARENA_CHANNEL_ID);
    if (!battle) return message.reply('No ongoing battle in the arena.');

    const loserId = battle.user1_id === winner.id ? battle.user2_id : battle.user1_id;
    const loser = await message.guild.members.fetch(loserId);
    const arena = await message.guild.channels.fetch(ARENA_CHANNEL_ID);

    // Winner embed
    const winnerEmbed = new EmbedBuilder()
      .setColor('#34d399')
      .setDescription(`<@${winner.id}> has successfully humbled <@${loser.id}>!`);
    await arena.send({ embeds: [winnerEmbed] });

    // Loser embed
    const muteEmbed = new EmbedBuilder()
      .setColor('#f87171')
      .setDescription(`<@${loser.id}> gets muted for 10 minutes to reflect upon their loss.`);
    await arena.send({ embeds: [muteEmbed] });

    // Mute loser
    try {
      await loser.timeout(LOSER_MUTE_DURATION, 'Lost 1v1 battle');
    } catch (err) {
      console.error('Failed to mute loser:', err);
    }

    // Lock channel for both
    for (const fighterId of [winner.id, loser.id]) {
      await arena.permissionOverwrites.edit(fighterId, {
        SendMessages: false,
      });
    }

    // Remove battle from DB
    client.battleDB.prepare('DELETE FROM ongoing_battles WHERE channel_id = ?')
      .run(ARENA_CHANNEL_ID);

    return message.reply('Battle concluded successfully.');
  },
};