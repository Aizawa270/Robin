// commands/misc/spy.js
const {
  EmbedBuilder,
  ChannelType
} = require('discord.js');
const { words } = require('../../utils/spyWords');

// Active game timers & lobby expiry timers
const activeGames = new Map();
const lobbyExpiry = new Map();

// ===============================
// AUTHORITY CHECK
// ===============================
const OWNER_ID = '852839588689870879';
const AUTHORIZED_ROLES = ['1447894643277561856', '1431650083585396897'];

function isAuthorized(message) {
  if (message.author.id === OWNER_ID) return true;
  if (!message.member) return false;
  return AUTHORIZED_ROLES.some(r => message.member.roles.cache.has(r));
}

// ===============================
// HINT WORD MAP
// ===============================
const hintMap = {
  // Nature
  sun: 'summer', moon: 'night', rain: 'umbrella', snow: 'winter',
  fire: 'smoke', water: 'ocean', tree: 'forest', flower: 'garden',
  cloud: 'sky', wind: 'breeze', ice: 'cold', storm: 'thunder',
  // Food
  cake: 'flour', bread: 'butter', milk: 'dairy', egg: 'breakfast',
  apple: 'orchard', pizza: 'cheese', sugar: 'sweet', salt: 'pepper',
  rice: 'bowl', fish: 'ocean', meat: 'grill', soup: 'spoon',
  // Objects
  ring: 'jewel', clock: 'time', door: 'key', book: 'library',
  chair: 'sit', table: 'wood', phone: 'call', money: 'bank',
  car: 'road', boat: 'sail', plane: 'flight', train: 'track',
  ball: 'game', lamp: 'light', mirror: 'glass', sword: 'battle',
  // Animals
  dog: 'leash', cat: 'meow', bird: 'feather', fish: 'fins',
  horse: 'stable', lion: 'mane', wolf: 'pack', bear: 'hibernate',
  snake: 'scales', eagle: 'talon', shark: 'ocean', rabbit: 'burrow',
  // People / places
  king: 'crown', queen: 'throne', castle: 'moat', school: 'class',
  city: 'streets', beach: 'sand', mountain: 'peak', island: 'ocean',
  // Abstract
  dream: 'sleep', love: 'heart', fear: 'dark', hope: 'wish',
  luck: 'clover', power: 'force', truth: 'lie', shadow: 'dark',
};

function getHint(word) {
  const lower = word.toLowerCase();
  if (hintMap[lower]) return hintMap[lower];
  // Fallback: first letter + length
  return `${word[0].toUpperCase()}${'_'.repeat(word.length - 1)} (${word.length} letters)`;
}

// ===============================
// LOBBY EXPIRY HELPERS
// ===============================
function setLobbyExpiry(client, lobbyId, guildId, channelId) {
  clearLobbyExpiry(lobbyId);
  const timer = setTimeout(async () => {
    const spyDB = client.spyDB;
    const lobby = spyDB.prepare('SELECT * FROM spy_lobbies WHERE lobby_id = ?').get(lobbyId);
    if (!lobby || lobby.status !== 'lobby') return;

    spyDB.prepare('DELETE FROM spy_players WHERE lobby_id = ?').run(lobbyId);
    spyDB.prepare('DELETE FROM spy_lobbies WHERE lobby_id = ?').run(lobbyId);
    lobbyExpiry.delete(lobbyId);

    try {
      const guild = client.guilds.cache.get(guildId);
      const ch = guild?.channels.cache.get(channelId);
      if (ch) {
        const embed = new EmbedBuilder()
          .setColor('#ff6600')
          .setTitle('⏰ Lobby Expired')
          .setDescription('The spy lobby was automatically disbanded after 30 minutes of inactivity.');
        await ch.send({ embeds: [embed] });
      }
    } catch {}
  }, 30 * 60 * 1000);

  lobbyExpiry.set(lobbyId, timer);
}

function clearLobbyExpiry(lobbyId) {
  if (lobbyExpiry.has(lobbyId)) {
    clearTimeout(lobbyExpiry.get(lobbyId));
    lobbyExpiry.delete(lobbyId);
  }
}

// ===============================
// WORD DETECTION - EXACT WORD MATCH ONLY
// ===============================
function containsExactWord(content, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z])`, 'i');
  return regex.test(content);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===============================
// MODULE EXPORT
// ===============================
module.exports = {
  name: 'spy',
  description: 'Spy game system',
  category: 'misc',
  usage: 'spy <lobby|join|leave|start|end|hint>',

  async execute(client, message, args) {
    if (!message.guild) return;

    const spyDB = client.spyDB;
    const sub = args[0]?.toLowerCase();

    // ===============================
    // CREATE LOBBY
    // ===============================
    if (sub === 'lobby') {
      const existing = spyDB.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (existing) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Lobby Already Exists')
          .setDescription('End the current lobby with `spy end` first.')] });
      }

      const result = spyDB.prepare(
        "INSERT INTO spy_lobbies (guild_id, host_id, status) VALUES (?, ?, 'lobby')"
      ).run(message.guild.id, message.author.id);

      const lobbyId = result.lastInsertRowid;

      spyDB.prepare('INSERT INTO spy_players (lobby_id, user_id) VALUES (?, ?)').run(lobbyId, message.author.id);

      // Start 30-min expiry
      setLobbyExpiry(client, lobbyId, message.guild.id, message.channel.id);

      const embed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle('🕵️ Spy Lobby Created')
        .setDescription(
          `**Host:** ${message.author}\n` +
          `**Players:** 1/∞\n` +
          `**Status:** Waiting for players\n\n` +
          `**Commands:**\n` +
          `• \`spy join\` - Join the lobby\n` +
          `• \`spy leave\` - Leave the lobby\n` +
          `• \`spy start\` - Start game (min 5 players)\n` +
          `• \`spy hint off\` - Disable hint for spy (host only)\n\n` +
          `**How it works:**\n` +
          `• 2 rounds of turn-based speaking\n` +
          `• Each player gets 15 seconds per turn\n` +
          `• Discussion time after each round (2 mins)\n` +
          `• Vote to eliminate the spy!\n\n` +
          `⏰ Lobby auto-disbands in **30 minutes** if not started.`
        )
        .setFooter({ text: `Lobby ID: ${lobbyId} • Need 4 more players` });

      return message.reply({ embeds: [embed] });
    }

    // ===============================
    // HINT TOGGLE
    // ===============================
    if (sub === 'hint') {
      const lobby = spyDB.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ No Lobby Found')
          .setDescription('Create a lobby with `spy lobby` first.')] });
      }

      if (lobby.host_id !== message.author.id && !isAuthorized(message)) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ No Permission')
          .setDescription('Only the host or admins can toggle hints!')] });
      }

      if (lobby.status !== 'lobby') {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Game Already Started')
          .setDescription('Hints can only be toggled before the game starts.')] });
      }

      if (!client.spyHintDisabled) client.spyHintDisabled = new Set();

      const action = args[1]?.toLowerCase();

      if (action === 'off') {
        client.spyHintDisabled.add(lobby.lobby_id);
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ffaa00').setTitle('❌ Hints Disabled')
          .setDescription('The spy will **not** receive a hint word this game.')
          .setFooter({ text: 'Hints are on by default for new games.' })] });
      } else {
        client.spyHintDisabled.delete(lobby.lobby_id);
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#00ff00').setTitle('✅ Hints Enabled')
          .setDescription('The spy will receive a related hint word in their DM.')
          .setFooter({ text: 'This is the default setting.' })] });
      }
    }

    // ===============================
    // JOIN LOBBY
    // ===============================
    if (sub === 'join') {
      const lobby = spyDB.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ No Lobby Found')
          .setDescription('Create a lobby with `spy lobby` first.')] });
      }
      if (lobby.status !== 'lobby') {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Game Already Started')
          .setDescription('Wait for the current game to end.')] });
      }

      const already = spyDB.prepare('SELECT * FROM spy_players WHERE lobby_id = ? AND user_id = ?').get(lobby.lobby_id, message.author.id);
      if (already) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Already Joined')
          .setDescription('You are already in the lobby!')] });
      }

      spyDB.prepare('INSERT INTO spy_players (lobby_id, user_id) VALUES (?, ?)').run(lobby.lobby_id, message.author.id);

      const playerCount = spyDB.prepare('SELECT COUNT(*) as count FROM spy_players WHERE lobby_id = ?').get(lobby.lobby_id).count;
      const needed = Math.max(0, 5 - playerCount);

      return message.reply({ embeds: [new EmbedBuilder()
        .setColor('#00ff00').setTitle('✅ Joined Lobby')
        .setDescription(
          `${message.author} joined the game!\n\n` +
          `**Players:** ${playerCount}/∞\n` +
          `**Status:** ${needed > 0 ? `Need ${needed} more to start` : 'Ready to start!'}`
        )
        .setFooter({ text: `Lobby ID: ${lobby.lobby_id}` })] });
    }

    // ===============================
    // LEAVE LOBBY
    // ===============================
    if (sub === 'leave') {
      const lobby = spyDB.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ No Lobby Found')
          .setDescription('There is no active lobby.')] });
      }
      if (lobby.status !== 'lobby') {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Cannot Leave')
          .setDescription('Game already started! You cannot leave now.')] });
      }

      const player = spyDB.prepare('SELECT * FROM spy_players WHERE lobby_id = ? AND user_id = ?').get(lobby.lobby_id, message.author.id);
      if (!player) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Not in Lobby')
          .setDescription('You are not in the lobby.')] });
      }
      if (lobby.host_id === message.author.id) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Host Cannot Leave')
          .setDescription('You are the host! Use `spy end` to close the lobby.')] });
      }

      spyDB.prepare('DELETE FROM spy_players WHERE lobby_id = ? AND user_id = ?').run(lobby.lobby_id, message.author.id);
      const playerCount = spyDB.prepare('SELECT COUNT(*) as count FROM spy_players WHERE lobby_id = ?').get(lobby.lobby_id).count;

      return message.reply({ embeds: [new EmbedBuilder()
        .setColor('#ffaa00').setTitle('👋 Left Lobby')
        .setDescription(`${message.author} left the lobby.\n\n**Remaining Players:** ${playerCount}`)] });
    }

    // ===============================
    // START GAME
    // ===============================
    if (sub === 'start') {
      const lobby = spyDB.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ No Lobby Found')
          .setDescription('Create a lobby with `spy lobby` first.')] });
      }
      if (lobby.host_id !== message.author.id && !isAuthorized(message)) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Not the Host')
          .setDescription('Only the host can start the game!')] });
      }
      if (lobby.status !== 'lobby') {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Game Already Started')
          .setDescription('The game is already running!')] });
      }

      const players = spyDB.prepare('SELECT user_id FROM spy_players WHERE lobby_id = ?').all(lobby.lobby_id);
      if (players.length < 5) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Not Enough Players')
          .setDescription(
            `Need at least 5 players to start!\n\n` +
            `**Current:** ${players.length}/5\n` +
            `**Needed:** ${5 - players.length} more`
          )] });
      }

      // Cancel expiry timer — game is starting
      clearLobbyExpiry(lobby.lobby_id);

      spyDB.prepare("UPDATE spy_lobbies SET status = 'starting' WHERE lobby_id = ?").run(lobby.lobby_id);

      // Acknowledge then move on — no await on this reply so it doesn't block
      message.reply({ embeds: [new EmbedBuilder()
        .setColor('#ffaa00').setTitle('🎮 Starting Game...')
        .setDescription('Creating private channel and sending DMs...')] }).catch(() => {});

      // Create spy channel
      const channel = await message.guild.channels.create({
        name: '🕵️-spy-game',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: message.guild.roles.everyone.id, deny: ['ViewChannel'] },
          ...players.map(p => ({
            id: p.user_id,
            allow: ['ViewChannel', 'ReadMessageHistory'],
            deny: ['SendMessages'],
          })),
        ],
      });

      spyDB.prepare('UPDATE spy_lobbies SET channel_id = ?, spy_channel_id = ?, status = ? WHERE lobby_id = ?')
        .run(channel.id, channel.id, 'playing', lobby.lobby_id);

      const spyCount = players.length >= 10 ? 2 : 1;
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const spies = shuffled.slice(0, spyCount);

      const secretWord = words[Math.floor(Math.random() * words.length)];
      spyDB.prepare('UPDATE spy_lobbies SET secret_word = ? WHERE lobby_id = ?').run(secretWord, lobby.lobby_id);

      for (const spy of spies) {
        spyDB.prepare('UPDATE spy_players SET is_spy = 1 WHERE lobby_id = ? AND user_id = ?').run(lobby.lobby_id, spy.user_id);
      }

      // Hints ON by default; only off if host explicitly disabled
      const hintsOff = client.spyHintDisabled?.has(lobby.lobby_id) || false;
      const spyHint = hintsOff ? null : getHint(secretWord);

      // Send DMs
      let dmSuccess = 0;
      const dmFailed = [];

      for (const player of players) {
        try {
          const user = await client.users.fetch(player.user_id);
          const isSpy = spies.some(s => s.user_id === player.user_id);

          const dmEmbed = new EmbedBuilder()
            .setColor(isSpy ? '#ff0000' : '#00ff00')
            .setTitle(isSpy ? '🕵️ YOU ARE THE SPY!' : '✅ You are a Regular Player')
            .setDescription(
              isSpy
                ? `**Your role:** SPY ${spyCount === 2 ? '(1 of 2 spies)' : '(the only spy)'}\n\n` +
                  `❌ You **DON'T** know the secret word\n` +
                  `👂 Listen carefully to others\n` +
                  `🎭 Try to blend in and guess the word\n` +
                  `⚠️ Don't get caught!\n\n` +
                  (spyHint ? `💡 **Hint word:** \`${spyHint}\`\n\n` : `*(No hint this game)*\n\n`) +
                  `💡 **Tip:** During voting, you can guess the word to win instantly!`
                : `**Your secret word is:**\n# ${secretWord.toUpperCase()}\n\n` +
                  `🕵️ There ${spyCount === 1 ? 'is **1 spy**' : 'are **2 spies**'} among you\n` +
                  `🤐 **DON'T say the word directly!**\n` +
                  `💬 Describe it carefully\n` +
                  `🔍 Find the spy!\n\n` +
                  `⚠️ **WARNING:** If anyone says the secret word in chat, spies win instantly!`
            )
            .setFooter({ text: `Lobby #${lobby.lobby_id} • Good luck!` })
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] });
          dmSuccess++;
        } catch (err) {
          console.error(`❌ Failed to DM ${player.user_id}:`, err.message);
          dmFailed.push(player.user_id);
        }
      }

      const playerPings = players.map(p => `<@${p.user_id}>`).join(' ');

      await channel.send({
        content: playerPings,
        embeds: [new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🎮 SPY GAME STARTED!')
          .setDescription(
            `**Players:** ${players.length}\n` +
            `**Spies:** ${spyCount}\n` +
            `**DMs Sent:** ${dmSuccess}/${players.length}\n` +
            `**Spy hint:** ${hintsOff ? 'Off' : 'On'}\n\n` +
            `${dmFailed.length > 0 ? `⚠️ **Failed DMs:** ${dmFailed.map(id => `<@${id}>`).join(', ')}\nMake sure DMs are enabled!\n\n` : ''}` +
            `**📋 Game Rules:**\n` +
            `• Check your DMs for your role\n` +
            `• 2 rounds of turn-based speaking (randomized order)\n` +
            `• Each player gets 15 seconds per turn\n` +
            `• 2 minutes discussion after each round\n` +
            `• Vote to eliminate suspects\n\n` +
            `🚨 **If anyone says the secret word exactly, spies win instantly!**`
          )
          .setFooter({ text: 'Game starting in 5 seconds...' })
          .setTimestamp()],
      });

      // Clean up hint flag (resets for next game)
      client.spyHintDisabled?.delete(lobby.lobby_id);

      await sleep(5000);
      await runGameLoop(client, lobby.lobby_id, channel, players, secretWord);
      return;
    }

    // ===============================
    // END GAME
    // ===============================
    if (sub === 'end') {
      const lobby = spyDB.prepare('SELECT * FROM spy_lobbies WHERE guild_id = ?').get(message.guild.id);
      if (!lobby) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ No Lobby Found')
          .setDescription('There is no active lobby.')] });
      }
      if (lobby.host_id !== message.author.id && !isAuthorized(message)) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ Not the Host')
          .setDescription('Only the host or admins can end the game!')] });
      }

      clearLobbyExpiry(lobby.lobby_id);

      if (activeGames.has(lobby.lobby_id)) {
        const timers = activeGames.get(lobby.lobby_id);
        timers.forEach(t => clearTimeout(t));
        activeGames.delete(lobby.lobby_id);
      }

      if (lobby.spy_channel_id) {
        const spyChannel = message.guild.channels.cache.get(lobby.spy_channel_id);
        if (spyChannel) {
          // Reveal spies on force-end
          const spyPlayers = spyDB.prepare('SELECT user_id FROM spy_players WHERE lobby_id = ? AND is_spy = 1').all(lobby.lobby_id);
          const spyMentions = spyPlayers.length > 0
            ? spyPlayers.map(p => `<@${p.user_id}>`).join(', ')
            : 'Unknown';

          await spyChannel.send({ embeds: [new EmbedBuilder()
            .setColor('#ff6600')
            .setTitle('🛑 Game Force Ended')
            .setDescription(
              `The game was ended early by the host/admin.\n\n` +
              `🕵️ **The ${spyPlayers.length > 1 ? 'spies were' : 'spy was'}:** ${spyMentions}\n\n` +
              `This channel will be deleted in 10 seconds...`
            )
            .setTimestamp()] }).catch(() => {});

          await sleep(10000);
          await spyChannel.delete().catch(() => {});
        }
      }

      spyDB.prepare('DELETE FROM spy_players WHERE lobby_id = ?').run(lobby.lobby_id);
      spyDB.prepare('DELETE FROM spy_lobbies WHERE lobby_id = ?').run(lobby.lobby_id);

      return message.reply({ embeds: [new EmbedBuilder()
        .setColor('#00ff00').setTitle('✅ Lobby Ended')
        .setDescription('The spy game lobby has been closed and all data cleared.')] });
    }

    // ===============================
    // FALLBACK HELP
    // ===============================
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor('#ec4899')
      .setTitle('🕵️ Spy Game Commands')
      .setDescription(
        '**Available Commands:**\n' +
        '• `spy lobby` - Create a new lobby\n' +
        '• `spy join` - Join existing lobby\n' +
        '• `spy leave` - Leave the lobby\n' +
        '• `spy hint off` - Disable hint for spy this game (host/admin only)\n' +
        '• `spy hint on` - Re-enable hint (host/admin only)\n' +
        '• `spy start` - Start game (host/admin only, min 5 players)\n' +
        '• `spy end` - End game and close lobby (host/admin only)\n\n' +
        '💡 Spy hints are **on by default** every game.'
      )
      .setFooter({ text: 'Have fun finding the spy!' })] });
  },
};

// ===============================
// GAME LOOP
// ===============================
async function runGameLoop(client, lobbyId, channel, players, secretWord) {
  const spyDB = client.spyDB;
  const timers = [];
  activeGames.set(lobbyId, timers);

  const messageCollector = channel.createMessageCollector();

  messageCollector.on('collect', async (msg) => {
    if (msg.author.bot) return;
    if (!containsExactWord(msg.content, secretWord)) return;

    messageCollector.stop();
    timers.forEach(t => clearTimeout(t));

    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🚨 SECRET WORD SAID!')
      .setDescription(
        `**${msg.author}** said the secret word: \`${secretWord}\`\n\n` +
        `**🕵️ SPIES WIN!**\n\n` +
        `Channel closing in 10 seconds...`
      )
      .setTimestamp()] });

    setTimeout(async () => {
      await channel.delete().catch(() => {});
      spyDB.prepare('DELETE FROM spy_players WHERE lobby_id = ?').run(lobbyId);
      spyDB.prepare('DELETE FROM spy_lobbies WHERE lobby_id = ?').run(lobbyId);
      activeGames.delete(lobbyId);
    }, 10000);
  });

  let alivePlayers = spyDB.prepare('SELECT user_id, is_spy FROM spy_players WHERE lobby_id = ? AND alive = 1').all(lobbyId);
  let currentRound = 1;
  const totalSpies = alivePlayers.filter(p => p.is_spy === 1).length;

  while (currentRound <= 2 && alivePlayers.filter(p => p.is_spy === 1).length > 0) {
    const speakingOrder = [...alivePlayers].sort(() => Math.random() - 0.5);
    const orderList = speakingOrder.map((p, i) => `${i + 1}. <@${p.user_id}>`).join('\n');

    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#00aaff')
      .setTitle(`🎯 ROUND ${currentRound}/2`)
      .setDescription(
        `**Turn-based speaking begins!**\n\n` +
        `Each player gets **15 seconds** to describe the word.\n` +
        `🔒 Chat is locked except for the current player.\n\n` +
        `**Speaking order this round:**\n${orderList}`
      )
      .setFooter({ text: 'Get ready!' })] });

    await sleep(5000);

    for (const player of speakingOrder) {
      // Lock everyone
      for (const p of alivePlayers) {
        await channel.permissionOverwrites.edit(p.user_id, { SendMessages: false });
      }
      // Unlock current
      await channel.permissionOverwrites.edit(player.user_id, { SendMessages: true });

      await channel.send({ embeds: [new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('🎤 Your Turn!')
        .setDescription(`<@${player.user_id}>, you have **15 seconds** to describe!`)
        .setFooter({ text: 'Say one thing about the word' })] });

      await sleep(15000);

      await channel.permissionOverwrites.edit(player.user_id, { SendMessages: false });
    }

    // Unlock all for discussion
    for (const player of alivePlayers) {
      await channel.permissionOverwrites.edit(player.user_id, { SendMessages: true });
    }

    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('💬 DISCUSSION TIME')
      .setDescription(
        `Round ${currentRound} complete!\n\n` +
        `🔓 Chat unlocked for **2 minutes**.\n` +
        `Discuss who you think the spy is!`
      )
      .setFooter({ text: 'Discussion ends in 2 minutes' })] });

    await sleep(120000);
    currentRound++;
  }

  // Lock for voting
  for (const player of alivePlayers) {
    await channel.permissionOverwrites.edit(player.user_id, { SendMessages: false });
  }

  await handleVoting(client, lobbyId, channel, alivePlayers, secretWord, totalSpies, messageCollector);
}

// ===============================
// VOTING
// ===============================
async function handleVoting(client, lobbyId, channel, alivePlayers, secretWord, totalSpies, messageCollector) {
  const spyDB = client.spyDB;
  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  const voteMsg = await channel.send({ embeds: [new EmbedBuilder()
    .setColor('#ff6600')
    .setTitle('🗳️ VOTING TIME')
    .setDescription(
      `**Vote for who you think is the spy!**\n\n` +
      alivePlayers.map((p, i) => `${numberEmojis[i]} <@${p.user_id}>`).join('\n') +
      `\n\nReact with the number of your suspect!\n` +
      `You have **30 seconds** to vote.`
    )
    .setFooter({ text: 'Majority vote eliminates the suspect' })] });

  for (let i = 0; i < Math.min(alivePlayers.length, 10); i++) {
    await voteMsg.react(numberEmojis[i]);
  }

  await sleep(30000);

  const reactions = voteMsg.reactions.cache;
  const votes = new Map();
  reactions.forEach((reaction, emoji) => {
    const index = numberEmojis.indexOf(emoji);
    if (index !== -1 && index < alivePlayers.length) {
      votes.set(index, reaction.count - 1);
    }
  });

  let maxVotes = 0;
  let eliminatedIndex = 0;
  votes.forEach((count, index) => {
    if (count > maxVotes) { maxVotes = count; eliminatedIndex = index; }
  });

  const eliminated = alivePlayers[eliminatedIndex];
  const isSpy = eliminated.is_spy === 1;

  spyDB.prepare('UPDATE spy_players SET alive = 0 WHERE lobby_id = ? AND user_id = ?').run(lobbyId, eliminated.user_id);

  const remainingSpies = alivePlayers.filter(p => p.is_spy === 1 && p.user_id !== eliminated.user_id).length;

  if (isSpy && (totalSpies === 1 || remainingSpies === 0)) {
    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#00ff00').setTitle('✅ PLAYERS WIN!')
      .setDescription(
        `<@${eliminated.user_id}> was **THE SPY!**\n\n` +
        `🎉 Congratulations to all regular players!\n\n` +
        `**The secret word was:** \`${secretWord}\``
      ).setTimestamp()] });

    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#5865F2').setTitle('🎮 Game Over')
      .setDescription('This channel will be deleted in **10 seconds**...')
      .setFooter({ text: 'GG WP!' }).setTimestamp()] });

    messageCollector.stop();
    setTimeout(async () => {
      await channel.delete().catch(() => {});
      spyDB.prepare('DELETE FROM spy_players WHERE lobby_id = ?').run(lobbyId);
      spyDB.prepare('DELETE FROM spy_lobbies WHERE lobby_id = ?').run(lobbyId);
      activeGames.delete(lobbyId);
    }, 10000);

  } else if (isSpy && totalSpies === 2 && remainingSpies === 1) {
    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#ffaa00').setTitle('⚠️ SPY ELIMINATED')
      .setDescription(
        `<@${eliminated.user_id}> was **A SPY!**\n\n` +
        `But there's still **1 spy remaining**...\n\n` +
        `Starting another 2 rounds in 5 seconds!`
      ).setTimestamp()] });

    await sleep(5000);

    const newAlivePlayers = spyDB.prepare('SELECT user_id, is_spy FROM spy_players WHERE lobby_id = ? AND alive = 1').all(lobbyId);
    await runGameLoop(client, lobbyId, channel, newAlivePlayers, secretWord);

  } else {
    const spyList = alivePlayers.filter(p => p.is_spy === 1).map(p => `<@${p.user_id}>`).join(', ');

    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#ff0000').setTitle('🕵️ SPIES WIN!')
      .setDescription(
        `<@${eliminated.user_id}> was **NOT A SPY!**\n\n` +
        `The ${totalSpies === 1 ? 'spy was' : 'spies were'}: ${spyList}\n\n` +
        `**The secret word was:** \`${secretWord}\``
      ).setTimestamp()] });

    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#5865F2').setTitle('🎮 Game Over')
      .setDescription('This channel will be deleted in **10 seconds**...')
      .setFooter({ text: 'GG WP!' }).setTimestamp()] });

    messageCollector.stop();
    setTimeout(async () => {
      await channel.delete().catch(() => {});
      spyDB.prepare('DELETE FROM spy_players WHERE lobby_id = ?').run(lobbyId);
      spyDB.prepare('DELETE FROM spy_lobbies WHERE lobby_id = ?').run(lobbyId);
      activeGames.delete(lobbyId);
    }, 10000);
  }
}
