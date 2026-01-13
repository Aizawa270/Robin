// commands/misc/spy.js
const {
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

module.exports = {
  name: 'spy',
  description: 'Spy game system',
  category: 'misc',
  usage: 'spy <create|join|start|end>',
  async execute(client, message, args) {
    if (!message.guild) return;

    const spyDB = client.spyDB;
    const sub = args[0];

    // ===============================
    // CREATE LOBBY
    // ===============================
    if (sub === 'create') {
      // check existing lobby
      const existing = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (existing) {
        return message.reply('There is already an active spy lobby.');
      }

      // create lobby row
      const result = spyDB.prepare(`
        INSERT INTO spy_lobbies (guild_id, host_id, status)
        VALUES (?, ?, 'lobby')
      `).run(message.guild.id, message.author.id);

      const lobbyId = result.lastInsertRowid;

      // create PRIVATE CHANNEL
      const channel = await message.guild.channels.create({
        name: `spy-lobby-${lobbyId}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: message.guild.roles.everyone.id,
            deny: ['ViewChannel'],
          },
          {
            id: message.author.id,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
          },
        ],
      });

      // save channel id
      spyDB.prepare(`
        UPDATE spy_lobbies
        SET channel_id = ?
        WHERE lobby_id = ?
      `).run(channel.id, lobbyId);

      // add host as player
      spyDB.prepare(`
        INSERT INTO spy_players (lobby_id, user_id)
        VALUES (?, ?)
      `).run(lobbyId, message.author.id);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#ec4899')
            .setTitle('🕵️ Spy Lobby Created')
            .setDescription(
              `Lobby ID: **${lobbyId}**\n` +
              `Private channel created: ${channel}\n\n` +
              `Others can join with:\n\`spy join\``
            ),
        ],
      });
    }

    // ===============================
    // JOIN LOBBY
    // ===============================
    if (sub === 'join') {
      const lobby = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (!lobby) {
        return message.reply('No active spy lobby.');
      }

      const already = spyDB.prepare(`
        SELECT * FROM spy_players
        WHERE lobby_id = ? AND user_id = ?
      `).get(lobby.lobby_id, message.author.id);

      if (already) {
        return message.reply('You are already in the lobby.');
      }

      // add player
      spyDB.prepare(`
        INSERT INTO spy_players (lobby_id, user_id)
        VALUES (?, ?)
      `).run(lobby.lobby_id, message.author.id);

      // give channel access
      const channel = message.guild.channels.cache.get(lobby.channel_id);
      if (channel) {
        await channel.permissionOverwrites.create(message.author.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
      }

      return message.reply('You joined the spy lobby.');
    }

    // ===============================
    // START GAME (HOST ONLY)
    // ===============================
    if (sub === 'start') {
      const lobby = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (!lobby) return message.reply('No lobby exists.');
      if (lobby.host_id !== message.author.id) {
        return message.reply('Only the host can start the game.');
      }

      spyDB.prepare(`
        UPDATE spy_lobbies
        SET status = 'playing', round = 1
        WHERE lobby_id = ?
      `).run(lobby.lobby_id);

      return message.reply('🟢 Spy game started.');
    }

    // ===============================
    // END GAME (HOST ONLY)
    // ===============================
    if (sub === 'end') {
      const lobby = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (!lobby) return message.reply('No lobby exists.');
      if (lobby.host_id !== message.author.id) {
        return message.reply('Only the host can end the game.');
      }

      // delete channel
      const channel = message.guild.channels.cache.get(lobby.channel_id);
      if (channel) await channel.delete().catch(() => {});

      // clean DB
      spyDB.prepare(`DELETE FROM spy_players WHERE lobby_id = ?`).run(lobby.lobby_id);
      spyDB.prepare(`DELETE FROM spy_lobbies WHERE lobby_id = ?`).run(lobby.lobby_id);

      return message.reply('🛑 Spy game ended and lobby deleted.');
    }

    // ===============================
    // FALLBACK
    // ===============================
    return message.reply('Usage: `spy create | join | start | end`');
  },
};