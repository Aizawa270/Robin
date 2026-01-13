// commands/misc/spy.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  name: 'spy',
  description: 'Spy game commands (create/join/leave/list/start).',
  category: 'misc',
  usage: 'spy <create|join|leave|list|start>',
  aliases: ['spygame'],
  async execute(client, message, args) {
    if (!message.guild) return;

    const db = client.spyDB;
    const sub = args[0]?.toLowerCase();

    if (!sub || !['create','join','leave','list','start'].includes(sub)) {
      return message.reply('Usage: `spy <create|join|leave|list|start>`');
    }

    // ===== GET LOBBY =====
    let lobby = db.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);

    // ===== CREATE =====
    if (sub === 'create') {
      if (lobby) return message.reply('A spy lobby already exists in this server.');

      const res = db.prepare(`
        INSERT INTO spy_lobbies (guild_id, host_id, status)
        VALUES (?, ?, 'lobby')
      `).run(message.guild.id, message.author.id);

      const lobbyId = res.lastInsertRowid;

      // Add host to players table
      db.prepare(`
        INSERT INTO spy_players (lobby_id, user_id)
        VALUES (?, ?)
      `).run(lobbyId, message.author.id);

      return message.reply('✅ Spy lobby created! You are the host.');
    }

    // ===== JOIN =====
    if (sub === 'join') {
      if (!lobby) return message.reply('No lobby exists. Create one with `spy create`.');

      const exists = db.prepare('SELECT * FROM spy_players WHERE lobby_id = ? AND user_id = ?')
                       .get(lobby.lobby_id, message.author.id);
      if (exists) return message.reply('You are already in the lobby.');

      db.prepare('INSERT INTO spy_players (lobby_id, user_id) VALUES (?, ?)').run(lobby.lobby_id, message.author.id);
      return message.reply('✅ You joined the spy lobby!');
    }

    // ===== LEAVE =====
    if (sub === 'leave') {
      if (!lobby) return message.reply('No lobby exists.');
      const player = db.prepare('SELECT * FROM spy_players WHERE lobby_id = ? AND user_id = ?')
                       .get(lobby.lobby_id, message.author.id);
      if (!player) return message.reply('You are not in the lobby.');

      db.prepare('DELETE FROM spy_players WHERE lobby_id = ? AND user_id = ?')
        .run(lobby.lobby_id, message.author.id);

      // if host leaves, transfer or delete lobby
      if (lobby.host_id === message.author.id) {
        const nextPlayer = db.prepare('SELECT * FROM spy_players WHERE lobby_id = ? LIMIT 1').get(lobby.lobby_id);
        if (nextPlayer) {
          db.prepare('UPDATE spy_lobbies SET host_id = ? WHERE lobby_id = ?')
            .run(nextPlayer.user_id, lobby.lobby_id);
          return message.reply(`Host left. New host is <@${nextPlayer.user_id}>`);
        } else {
          db.prepare('DELETE FROM spy_lobbies WHERE lobby_id = ?').run(lobby.lobby_id);
          return message.reply('Lobby deleted as all players left.');
        }
      }

      return message.reply('✅ You left the lobby.');
    }

    // ===== LIST =====
    if (sub === 'list') {
      if (!lobby) return message.reply('No lobby exists.');
      const players = db.prepare('SELECT user_id FROM spy_players WHERE lobby_id = ?')
                        .all(lobby.lobby_id).map(r => `<@${r.user_id}>`);
      const embed = new EmbedBuilder()
        .setTitle('Spy Lobby Players')
        .setDescription(players.join('\n') || 'No players?')
        .setFooter({ text: `Host: <@${lobby.host_id}>` })
        .setColor('#ec4899');
      return message.reply({ embeds: [embed] });
    }

    // ===== START =====
    if (sub === 'start') {
      if (!lobby) return message.reply('No lobby exists.');
      if (lobby.host_id !== message.author.id) return message.reply('Only the host can start the game.');

      const players = db.prepare('SELECT user_id FROM spy_players WHERE lobby_id = ?')
                        .all(lobby.lobby_id)
                        .map(r => r.user_id);

      if (players.length < 3) return message.reply('Need at least 3 players to start.');

      // pick random spy
      const spyIndex = Math.floor(Math.random() * players.length);
      const spyId = players[spyIndex];

      // set spy in db
      db.prepare('UPDATE spy_players SET is_spy = 1 WHERE lobby_id = ? AND user_id = ?')
        .run(lobby.lobby_id, spyId);

      // update lobby status
      db.prepare('UPDATE spy_lobbies SET status = ? WHERE lobby_id = ?').run('started', lobby.lobby_id);

      // DM spy
      try {
        const user = await client.users.fetch(spyId);
        await user.send(`You are the SPY! Shhh 🤫`);
      } catch {}

      return message.reply('🚀 Spy game started! Spy has been chosen.');
    }
  },
};