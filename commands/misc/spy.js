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

    // helper: fetch lobby safely
    const getLobby = () => {
      const lobby = db.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) return null;

      // fix missing columns fallback
      if (!('players' in lobby)) lobby.players = JSON.stringify([lobby.host_id]);
      if (!('spies' in lobby)) lobby.spies = JSON.stringify([]);
      if (!('round' in lobby)) lobby.round = 0;
      if (!('stage' in lobby)) lobby.stage = 'lobby';
      if (!('channel_id' in lobby)) lobby.channel_id = null;
      if (!('word' in lobby)) lobby.word = null;

      return lobby;
    };

    // ==== CREATE LOBBY ====
    if (sub === 'lobby') {
      const existing = getLobby();
      if (existing) return message.reply('A lobby already exists in this server.');

      db.prepare(`
        INSERT INTO spy_lobbies (guild_id, host_id, players, spies, round, stage)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(message.guild.id, message.author.id, JSON.stringify([message.author.id]), JSON.stringify([]), 0, 'lobby');

      return message.reply('🕵️‍♂️ Spy lobby created! Players can join with `!spy join`.');
    }

    // ==== JOIN LOBBY ====
    if (sub === 'join') {
      const lobby = getLobby();
      if (!lobby) return message.reply('No lobby exists. Create one with `!spy lobby`.');

      let players = JSON.parse(lobby.players);
      if (players.includes(message.author.id)) return message.reply('You are already in the lobby.');

      players.push(message.author.id);
      db.prepare('UPDATE spy_lobbies SET players = ? WHERE guild_id = ?').run(JSON.stringify(players), message.guild.id);

      return message.reply(`${message.author.tag} joined the lobby! (${players.length} players total)`);
    }

    // ==== LEAVE LOBBY ====
    if (sub === 'leave') {
      const lobby = getLobby();
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
      const lobby = getLobby();
      if (!lobby) return message.reply('No lobby exists.');
      if (lobby.host_id !== message.author.id) return message.reply('Only the host can end the lobby.');

      if (lobby.channel_id) {
        const ch = message.guild.channels.cache.get(lobby.channel_id);
        if (ch) await ch.delete().catch(() => null);
      }

      db.prepare('DELETE FROM spy_lobbies WHERE guild_id = ?').run(message.guild.id);
      return message.reply('Lobby ended and deleted.');
    }

    // ==== STATUS ====
    if (sub === 'status') {
      const lobby = getLobby();
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
      const lobby = getLobby();
      if (!lobby) return message.reply('No lobby exists.');
      if (lobby.host_id !== message.author.id) return message.reply('Only the host can start the game.');

      let players = JSON.parse(lobby.players);
      if (players.length < 5) return message.reply('At least 5 players are required.');

      const spyChannel = await message.guild.channels.create('spy', {
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: message.guild.id, deny: ['ViewChannel'] },
          ...players.map(id => ({ id, allow: ['ViewChannel', 'SendMessages'] })),
        ],
      });

      const spyCount = players.length >= 10 ? 2 : 1;
      const shuffled = players.sort(() => Math.random() - 0.5);
      const spies = shuffled.slice(0, spyCount);
      const nonSpies = shuffled.filter(id => !spies.includes(id));
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];

      db.prepare(`
        UPDATE spy_lobbies SET channel_id = ?, spies = ?, word = ?, stage = ?, round = ? WHERE guild_id = ?
      `).run(spyChannel.id, JSON.stringify(spies), word, 'rounds', 1, message.guild.id);

      // DM spies and non-spies
      for (const spyId of spies) {
        const u = await client.users.fetch(spyId).catch(() => null);
        if (u) u.send('You are a SPY! Try to guess the word.').catch(() => null);
      }
      for (const playerId of nonSpies) {
        const u = await client.users.fetch(playerId).catch(() => null);
        if (u) u.send(`Your secret word is: **${word}**`).catch(() => null);
      }

      await message.reply(`🕵️‍♂️ Game started! Check the new channel: ${spyChannel}`);
      // rounds & voting logic remains same...
      return;
    }

    return message.reply(`Unknown subcommand. Use: ${prefix}spy lobby|join|leave|start|end|status`);
  },
};