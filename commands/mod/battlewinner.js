const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const ARENA_CHANNEL_ID = '1453791150556319979';

module.exports = {
  name: 'battlewinner',
  description: 'Declare the winner of a battle',
  category: 'mod',

  async execute(client, message) {
    if (!message.guild) return;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    const mentions = [...message.mentions.users.values()];
    if (mentions.length !== 2) return;

    const [winner, loser] = mentions;

    const battle = client.battleDB
      .prepare('SELECT * FROM ongoing_battles WHERE channel_id = ?')
      .get(ARENA_CHANNEL_ID);

    if (!battle) {
      return message.reply('No active battle.');
    }

    const fighters = [battle.user1_id, battle.user2_id];

    const embed = new EmbedBuilder()
      .setColor('#ef4444')
      .setDescription(`<@${winner.id}> has defeated <@${loser.id}>`);

    await message.channel.send({ embeds: [embed] });

    const textChannels = message.guild.channels.cache.filter(
      c => c.type === ChannelType.GuildText
    );

    await Promise.all(
      textChannels.flatMap(ch =>
        fighters.map(id =>
          ch.permissionOverwrites.delete(id).catch(() => {})
        )
      )
    );

    client.battleDB
      .prepare('DELETE FROM ongoing_battles WHERE channel_id = ?')
      .run(ARENA_CHANNEL_ID);
  }
};