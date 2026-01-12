// commands/misc/spy.js
const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const WORDS = require('../../utils/spyWords');

module.exports = {
  name: 'spy',
  description: 'Play the Spy game',
  category: 'misc',
  usage: '!spy <lobby|join|leave|start|end|status>',
  aliases: ['spygame'],
  async execute(client, message, args) {
    if (!message.guild) return;
    const db = client.spyDB;
    const prefix = client.getPrefix ? client.getPrefix(message.guild.id) : '!';

    const sub = args[0]?.toLowerCase();

    // ==== CREATE LOBBY ====
    if (sub === 'lobby') {
      const existing = db.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (existing) return message.reply('A lobby already exists in this server.');

      db.prepare(`
        INSERT INTO spy_lobbies (guild_id, host_id, players, spies, round, stage)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(message.guild.id, message.author.id, JSON.stringify([message.author.id]), JSON.stringify([]), 0, 'lobby');

      return message.reply('🕵️‍♂️ Spy lobby created! Players can join with `!spy join`.');
    }

    // ==== JOIN LOBBY ====
    if (sub === 'join') {
      const lobby = db.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) return message.reply('No lobby exists. Create one with `!spy lobby`.');

      const players = JSON.parse(lobby.players);
      if (players.includes(message.author.id)) return message.reply('You are already in the lobby.');

      players.push(message.author.id);
      db.prepare('UPDATE spy_lobbies SET players = ? WHERE guild_id = ?').run(JSON.stringify(players), message.guild.id);

      return message.reply(`${message.author.tag} joined the lobby! (${players.length} players total)`);
    }

    // ==== LEAVE LOBBY ====
    if (sub === 'leave') {
      const lobby = db.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) return message.reply('No lobby exists.');

      let players = JSON.parse(lobby.players);
      if (!players.includes(message.author.id)) return message.reply('You are not in the lobby.');

      players = players.filter(id => id !== message.author.id);

      if (players.length === 0) {
        db.prepare('DELETE FROM spy_lobbies WHERE guild_id = ?').run(message.guild.id);
        return message.reply('Lobby empty, deleted.');
      }

      db.prepare('UPDATE spy_lobbies SET players = ? WHERE guild_id = ?').run(JSON.stringify(players), message.guild.id);
      return message.reply(`${message.author.tag} left the lobby. (${players.length} players remaining)`);
    }

    // ==== END LOBBY ====
    if (sub === 'end') {
      const lobby = db.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) return message.reply('No lobby exists.');

      if (lobby.host_id !== message.author.id) return message.reply('Only the host can end the lobby.');

      // Delete channel if exists
      if (lobby.channel_id) {
        const ch = message.guild.channels.cache.get(lobby.channel_id);
        if (ch) await ch.delete().catch(() => null);
      }

      db.prepare('DELETE FROM spy_lobbies WHERE guild_id = ?').run(message.guild.id);
      return message.reply('Lobby ended and deleted.');
    }

    // ==== STATUS ====
    if (sub === 'status') {
      const lobby = db.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) return message.reply('No lobby exists.');

      const players = JSON.parse(lobby.players);
      const embed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('Spy Lobby Status')
        .addFields(
          { name: 'Host', value: `<@${lobby.host_id}>`, inline: false },
          { name: 'Players', value: players.map(id => `<@${id}>`).join('\n') || 'None', inline: false },
          { name: 'Stage', value: lobby.stage, inline: false }
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ==== START GAME ====
    if (sub === 'start') {
      const lobby = db.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) return message.reply('No lobby exists.');
      if (lobby.host_id !== message.author.id) return message.reply('Only the host can start the game.');

      let players = JSON.parse(lobby.players);
      if (players.length < 5) return message.reply('At least 5 players are required.');

      // Create temporary channel
      const spyChannel = await message.guild.channels.create('spy', {
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: message.guild.id, deny: ['ViewChannel'] },
          ...players.map(id => ({ id, allow: ['ViewChannel', 'SendMessages'] })),
        ],
      });

      // Pick spies
      const spyCount = players.length >= 10 ? 2 : 1;
      const shuffled = players.sort(() => Math.random() - 0.5);
      const spies = shuffled.slice(0, spyCount);
      const nonSpies = shuffled.filter(id => !spies.includes(id));

      // Pick word
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];

      // Save lobby state
      db.prepare('UPDATE spy_lobbies SET channel_id = ?, spies = ?, word = ?, stage = ?, round = ? WHERE guild_id = ?')
        .run(spyChannel.id, JSON.stringify(spies), word, 'rounds', 1, message.guild.id);

      // DM spies
      for (const spyId of spies) {
        const u = await client.users.fetch(spyId).catch(() => null);
        if (u) u.send(`You are a SPY! Try to guess the word.`).catch(() => null);
      }

      // DM others
      for (const playerId of nonSpies) {
        const u = await client.users.fetch(playerId).catch(() => null);
        if (u) u.send(`Your secret word is: **${word}**`).catch(() => null);
      }

      await message.reply(`🕵️‍♂️ Game started! Check the new channel: ${spyChannel}`);

      // Start rounds
      for (let round = 1; round <= 3; round++) {
        db.prepare('UPDATE spy_lobbies SET round = ? WHERE guild_id = ?').run(round, message.guild.id);
        for (const playerId of players) {
          const p = await client.users.fetch(playerId).catch(() => null);
          if (!p) continue;
          const embed = new EmbedBuilder()
            .setColor('#f59e0b')
            .setTitle(`Your turn to describe (Round ${round})`)
            .setDescription('You have 15 seconds to send **one message** in this channel.');

          const turnMessage = await spyChannel.send({ content: `<@${playerId}>`, embeds: [embed] });

          // Lock everyone else
          await spyChannel.permissionOverwrites.set(players.map(id => ({
            id,
            allow: id === playerId ? ['SendMessages', 'ViewChannel'] : [],
          })));

          const filter = m => m.author.id === playerId;
          const collected = await spyChannel.awaitMessages({ filter, max: 1, time: 15000 }).catch(() => null);

          await spyChannel.send(collected?.first() ? 'Description recorded!' : 'Time expired!');

          // unlock
          await spyChannel.permissionOverwrites.set(players.map(id => ({ id, allow: ['SendMessages', 'ViewChannel'] })));
        }

        // Discussion time
        await spyChannel.send(`Discussion for round ${round}. You have ${round < 3 ? '2 minutes' : '5 minutes'}!`);
        await new Promise(r => setTimeout(r, round < 3 ? 120000 : 300000));
      }

      // Voting phase
      const voteEmbed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('Voting Time! React to vote for who you think is the spy')
        .setDescription(players.map((id, i) => `${i + 1}. <@${id}>`).join('\n'));
      const voteMsg = await spyChannel.send({ embeds: [voteEmbed] });

      for (let i = 0; i < players.length; i++) await voteMsg.react(`${i + 1}\u20E3`);

      const reactions = await voteMsg.awaitReactions({
        filter: (r, u) => players.includes(u.id) && r.message.id === voteMsg.id,
        time: 30000
      }).catch(() => null);

      // Tally votes
      const voteCounts = {};
      if (reactions) {
        reactions.forEach((r) => {
          r.users.cache.forEach(u => {
            if (players.includes(u.id)) {
              const idx = r.emoji.name[0];
              voteCounts[idx] = (voteCounts[idx] || 0) + 1;
            }
          });
        });
      }

      // Pick most voted
      const maxVotes = Math.max(...Object.values(voteCounts || [0]));
      const votedPlayer = players[Object.keys(voteCounts).find(k => voteCounts[k] === maxVotes) - 1];

      await spyChannel.send(`The player voted out: <@${votedPlayer}>`);

      // Delete channel and end game
      await new Promise(r => setTimeout(r, 3000));
      await spyChannel.delete().catch(() => null);
      db.prepare('UPDATE spy_lobbies SET channel_id = NULL, stage = "ended" WHERE guild_id = ?').run(message.guild.id);
      return message.channel.send('Game ended!');
    }

    return message.reply(`Unknown subcommand. Use: ${prefix}spy lobby|join|leave|start|end|status`);
  },
};