const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const ARENA_CHANNEL_ID = '1453791150556319979';
const BATTLE_ANNOUNCE_ROLE = '1437440501702721547';

module.exports = {
  name: 'battle',
  description: 'Start a 1v1 battle between two users.',
  category: 'mod',
  usage: '!battle @user1 @user2',
  aliases: [],
  async execute(client, message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply('Only administrators can start battles.');

    const mentions = message.mentions.users;
    if (mentions.size !== 2) return message.reply('Please mention exactly **2 users**.');

    const [user1, user2] = mentions.map(u => u);

    const arena = await message.guild.channels.fetch(ARENA_CHANNEL_ID);
    if (!arena) return message.reply('Arena channel not found.');

    // Check if there’s already a battle
    const existing = client.battleDB.prepare('SELECT * FROM ongoing_battles WHERE channel_id = ?')
      .get(ARENA_CHANNEL_ID);
    if (existing) return message.reply('There is already an ongoing battle in the arena.');

    // Save to DB
    client.battleDB.prepare(`
      INSERT INTO ongoing_battles (channel_id, user1_id, user2_id, start_timestamp)
      VALUES (?, ?, ?, ?)
    `).run(ARENA_CHANNEL_ID, user1.id, user2.id, Date.now());

    // Lock channel for everyone
    await arena.permissionOverwrites.set([
      {
        id: message.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.SendMessages],
        allow: [PermissionFlagsBits.ViewChannel],
      },
    ]);

    // Give access to fighters
    for (const fighter of [user1, user2]) {
      await arena.permissionOverwrites.edit(fighter.id, {
        ViewChannel: true,
        SendMessages: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setDescription(`A battle between <@${user1.id}> and <@${user2.id}> has begun!`)
      .setFooter({ text: 'Let the battle commence!' });

    await arena.send({ content: `<@&${BATTLE_ANNOUNCE_ROLE}>`, embeds: [embed] });

    return message.reply('Battle successfully started!');
  },
};