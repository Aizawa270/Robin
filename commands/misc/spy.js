// commands/misc/spy.js
const {
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType
} = require('discord.js');
const { words } = require('../../utils/spyWords');

// Active game timers
const activeGames = new Map();

module.exports = {
  name: 'spy',
  description: 'Spy game system',
  category: 'misc',
  usage: 'spy <lobby|join|leave|start|end|hint>',
  async execute(client, message, args) {
    if (!message.guild) return;

    const spyDB = client.spyDB;
    const sub = args[0];

    // ===============================
    // CREATE LOBBY
    // ===============================
    if (sub === 'lobby') {
      const existing = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (existing) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Lobby Already Exists')
          .setDescription('End the current lobby with `spy end` first.');
        return message.reply({ embeds: [embed] });
      }

      const result = spyDB.prepare(`
        INSERT INTO spy_lobbies (guild_id, host_id, status)
        VALUES (?, ?, 'lobby')
      `).run(message.guild.id, message.author.id);

      const lobbyId = result.lastInsertRowid;

      spyDB.prepare(`
        INSERT INTO spy_players (lobby_id, user_id)
        VALUES (?, ?)
      `).run(lobbyId, message.author.id);

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
          `• \`spy hint\` - Toggle hint word for imposter (host only)\n\n` +
          `**How it works:**\n` +
          `• 2 rounds of turn-based speaking\n` +
          `• Each player gets 15 seconds per turn\n` +
          `• Discussion time after each round (2 mins)\n` +
          `• Vote to eliminate the spy!`
        )
        .setFooter({ text: `Lobby ID: ${lobbyId} • Need 4 more players` });

      return message.reply({ embeds: [embed] });
    }

    // ===============================
    // HINT TOGGLE (host only)
    // ===============================
    if (sub === 'hint') {
      const lobby = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (!lobby) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ No Lobby Found')
          .setDescription('Create a lobby with `spy lobby` first.');
        return message.reply({ embeds: [embed] });
      }

      if (lobby.host_id !== message.author.id) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Not the Host')
          .setDescription('Only the host can toggle hints!');
        return message.reply({ embeds: [embed] });
      }

      if (lobby.status !== 'lobby') {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Game Already Started')
          .setDescription('Hints can only be toggled before the game starts.');
        return message.reply({ embeds: [embed] });
      }

      // Toggle hint_enabled (stored as 0/1 in the DB)
      // We'll store it in a simple way: use a Map keyed by lobbyId
      // since spy_lobbies doesn't have a hint_enabled column by default,
      // we use client-side storage for this session
      if (!client.spyHintEnabled) client.spyHintEnabled = new Map();
      const current = client.spyHintEnabled.get(lobby.lobby_id) || false;
      const newVal = !current;
      client.spyHintEnabled.set(lobby.lobby_id, newVal);

      const embed = new EmbedBuilder()
        .setColor(newVal ? '#00ff00' : '#ffaa00')
        .setTitle(newVal ? '✅ Hint Enabled' : '❌ Hint Disabled')
        .setDescription(
          newVal
            ? `The imposter will receive a **vague hint** about the secret word in their DM.`
            : `The imposter will receive **no hint** about the secret word.`
        )
        .setFooter({ text: `Lobby ID: ${lobby.lobby_id}` });

      return message.reply({ embeds: [embed] });
    }

    // ===============================
    // JOIN LOBBY
    // ===============================
    if (sub === 'join') {
      const lobby = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (!lobby) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ No Lobby Found')
          .setDescription('Create a lobby with `spy lobby` first.');
        return message.reply({ embeds: [embed] });
      }

      if (lobby.status !== 'lobby') {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Game Already Started')
          .setDescription('Wait for the current game to end.');
        return message.reply({ embeds: [embed] });
      }

      const already = spyDB.prepare(`
        SELECT * FROM spy_players WHERE lobby_id = ? AND user_id = ?
      `).get(lobby.lobby_id, message.author.id);

      if (already) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Already Joined')
          .setDescription('You are already in the lobby!');
        return message.reply({ embeds: [embed] });
      }

      spyDB.prepare(`
        INSERT INTO spy_players (lobby_id, user_id)
        VALUES (?, ?)
      `).run(lobby.lobby_id, message.author.id);

      const playerCount = spyDB.prepare(`
        SELECT COUNT(*) as count FROM spy_players WHERE lobby_id = ?
      `).get(lobby.lobby_id).count;

      const needed = Math.max(0, 5 - playerCount);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Joined Lobby')
        .setDescription(
          `${message.author} joined the game!\n\n` +
          `**Players:** ${playerCount}/∞\n` +
          `**Status:** ${needed > 0 ? `Need ${needed} more to start` : 'Ready to start!'}`
        )
        .setFooter({ text: `Lobby ID: ${lobby.lobby_id}` });

      return message.reply({ embeds: [embed] });
    }

    // ===============================
    // LEAVE LOBBY
    // ===============================
    if (sub === 'leave') {
      const lobby = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (!lobby) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ No Lobby Found')
          .setDescription('There is no active lobby.');
        return message.reply({ embeds: [embed] });
      }

      if (lobby.status !== 'lobby') {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Cannot Leave')
          .setDescription('Game already started! You cannot leave now.');
        return message.reply({ embeds: [embed] });
      }

      const player = spyDB.prepare(`
        SELECT * FROM spy_players WHERE lobby_id = ? AND user_id = ?
      `).get(lobby.lobby_id, message.author.id);

      if (!player) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Not in Lobby')
          .setDescription('You are not in the lobby.');
        return message.reply({ embeds: [embed] });
      }

      if (lobby.host_id === message.author.id) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Host Cannot Leave')
          .setDescription('You are the host! Use `spy end` to close the lobby.');
        return message.reply({ embeds: [embed] });
      }

      spyDB.prepare(`
        DELETE FROM spy_players WHERE lobby_id = ? AND user_id = ?
      `).run(lobby.lobby_id, message.author.id);

      const playerCount = spyDB.prepare(`
        SELECT COUNT(*) as count FROM spy_players WHERE lobby_id = ?
      `).get(lobby.lobby_id).count;

      const embed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('👋 Left Lobby')
        .setDescription(
          `${message.author} left the lobby.\n\n` +
          `**Remaining Players:** ${playerCount}`
        );

      return message.reply({ embeds: [embed] });
    }

    // ===============================
    // START GAME
    // ===============================
    if (sub === 'start') {
      const lobby = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (!lobby) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ No Lobby Found')
          .setDescription('Create a lobby with `spy lobby` first.');
        return message.reply({ embeds: [embed] });
      }

      if (lobby.host_id !== message.author.id) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Not the Host')
          .setDescription('Only the host can start the game!');
        return message.reply({ embeds: [embed] });
      }

      if (lobby.status !== 'lobby') {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Game Already Started')
          .setDescription('The game is already running!');
        return message.reply({ embeds: [embed] });
      }

      const players = spyDB.prepare(`
        SELECT user_id FROM spy_players WHERE lobby_id = ?
      `).all(lobby.lobby_id);

      if (players.length < 5) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Not Enough Players')
          .setDescription(
            `Need at least 5 players to start!\n\n` +
            `**Current:** ${players.length}/5\n` +
            `**Needed:** ${5 - players.length} more`
          );
        return message.reply({ embeds: [embed] });
      }

      // LOCK THE LOBBY
      spyDB.prepare(`
        UPDATE spy_lobbies SET status = 'starting' WHERE lobby_id = ?
      `).run(lobby.lobby_id);

      const startEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('🎮 Starting Game...')
        .setDescription('Creating private channel and sending DMs...');

      await message.reply({ embeds: [startEmbed] });

      // Create spy channel
      const channel = await message.guild.channels.create({
        name: '🕵️-spy-game',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: message.guild.roles.everyone.id,
            deny: ['ViewChannel'],
          },
          ...players.map(p => ({
            id: p.user_id,
            allow: ['ViewChannel', 'ReadMessageHistory'],
            deny: ['SendMessages'],
          })),
        ],
      });

      spyDB.prepare(`
        UPDATE spy_lobbies
        SET channel_id = ?, spy_channel_id = ?, status = 'playing'
        WHERE lobby_id = ?
      `).run(channel.id, channel.id, lobby.lobby_id);

      // Determine spy count
      const spyCount = players.length >= 10 ? 2 : 1;
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const spies = shuffled.slice(0, spyCount);

      // Pick secret word
      const secretWord = words[Math.floor(Math.random() * words.length)];

      spyDB.prepare(`
        UPDATE spy_lobbies SET secret_word = ? WHERE lobby_id = ?
      `).run(secretWord, lobby.lobby_id);

      // Mark spies in database
      for (const spy of spies) {
        spyDB.prepare(`
          UPDATE spy_players SET is_spy = 1 WHERE lobby_id = ? AND user_id = ?
        `).run(lobby.lobby_id, spy.user_id);
      }

      // Generate a vague hint for the spy (category/length/first letter)
      const hintEnabled = client.spyHintEnabled?.get(lobby.lobby_id) || false;
      const spyHint = hintEnabled ? generateHint(secretWord) : null;

      // Send DMs to all players
      let dmSuccess = 0;
      let dmFailed = [];

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
                  (spyHint ? `💡 **Hint:** ${spyHint}\n\n` : '') +
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

      // Announce in spy channel
      const playerPings = players.map(p => `<@${p.user_id}>`).join(' ');

      const announceEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🎮 SPY GAME STARTED!')
        .setDescription(
          `**Players:** ${players.length}\n` +
          `**Spies:** ${spyCount}\n` +
          `**DMs Sent:** ${dmSuccess}/${players.length}\n` +
          `**Hint for spy:** ${hintEnabled ? 'Yes' : 'No'}\n\n` +
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
        .setTimestamp();

      await channel.send({ content: playerPings, embeds: [announceEmbed] });

      // Clean up hint toggle for this lobby
      client.spyHintEnabled?.delete(lobby.lobby_id);

      await sleep(5000);
      await runGameLoop(client, lobby.lobby_id, channel, players, secretWord);
    }

    // ===============================
    // END GAME
    // ===============================
    if (sub === 'end') {
      const lobby = spyDB
        .prepare(`SELECT * FROM spy_lobbies WHERE guild_id = ?`)
        .get(message.guild.id);

      if (!lobby) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ No Lobby Found')
          .setDescription('There is no active lobby.');
        return message.reply({ embeds: [embed] });
      }

      if (lobby.host_id !== message.author.id) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Not the Host')
          .setDescription('Only the host can end the game!');
        return message.reply({ embeds: [embed] });
      }

      if (activeGames.has(lobby.lobby_id)) {
        const timers = activeGames.get(lobby.lobby_id);
        timers.forEach(t => clearTimeout(t));
        activeGames.delete(lobby.lobby_id);
      }

      if (lobby.spy_channel_id) {
        const spyChannel = message.guild.channels.cache.get(lobby.spy_channel_id);
        if (spyChannel) {
          const closeEmbed = new EmbedBuilder()
            .setColor('#ff6600')
            .setTitle('🛑 Game Ended by Host')
            .setDescription('The game has been manually ended by the host.\n\nThis channel will be deleted in 5 seconds...')
            .setTimestamp();

          await spyChannel.send({ embeds: [closeEmbed] }).catch(() => {});
          await sleep(5000);
          await spyChannel.delete().catch(() => {});
        }
      }

      spyDB.prepare(`DELETE FROM spy_players WHERE lobby_id = ?`).run(lobby.lobby_id);
      spyDB.prepare(`DELETE FROM spy_lobbies WHERE lobby_id = ?`).run(lobby.lobby_id);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Lobby Ended')
        .setDescription('The spy game lobby has been closed and all data cleared.');

      return message.reply({ embeds: [embed] });
    }

    // ===============================
    // FALLBACK HELP
    // ===============================
    const helpEmbed = new EmbedBuilder()
      .setColor('#ec4899')
      .setTitle('🕵️ Spy Game Commands')
      .setDescription(
        '**Available Commands:**\n' +
        '• `spy lobby` - Create a new lobby\n' +
        '• `spy join` - Join existing lobby\n' +
        '• `spy leave` - Leave the lobby\n' +
        '• `spy hint` - Toggle hint word for imposter (host only, before start)\n' +
        '• `spy start` - Start game (host only, min 5 players)\n' +
        '• `spy end` - End game and close lobby (host only)'
      )
      .setFooter({ text: 'Have fun finding the spy!' });

    return message.reply({ embeds: [helpEmbed] });
  },
};

// ===============================
// HINT GENERATOR
// ===============================
function generateHint(word) {
  const len = word.length;
  const firstLetter = word[0].toUpperCase();
  // Vague hint: first letter + word length only, no category
  return `Starts with **${firstLetter}** • **${len}** letters`;
}

// ===============================
// WORD DETECTION - EXACT WORD MATCH ONLY
// ===============================
function containsExactWord(content, word) {
  // Use word boundary regex so "ring" doesn't match inside "suffering"
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z])`, 'i');
  return regex.test(content);
}

// ===============================
// GAME LOOP FUNCTION
// ===============================
async function runGameLoop(client, lobbyId, channel, players, secretWord) {
  const spyDB = client.spyDB;
  const timers = [];
  activeGames.set(lobbyId, timers);

  // Message listener for exact word detection
  const messageCollector = channel.createMessageCollector();

  messageCollector.on('collect', async (msg) => {
    if (msg.author.bot) return;

    if (containsExactWord(msg.content, secretWord)) {
      messageCollector.stop();
      timers.forEach(t => clearTimeout(t));

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🚨 SECRET WORD SAID!')
        .setDescription(
          `**${msg.author}** said the secret word: \`${secretWord}\`\n\n` +
          `**🕵️ SPIES WIN!**\n\n` +
          `Channel closing in 10 seconds...`
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });

      setTimeout(async () => {
        await channel.delete().catch(() => {});
        spyDB.prepare(`DELETE FROM spy_players WHERE lobby_id = ?`).run(lobbyId);
        spyDB.prepare(`DELETE FROM spy_lobbies WHERE lobby_id = ?`).run(lobbyId);
        activeGames.delete(lobbyId);
      }, 10000);

      return;
    }
  });

  let alivePlayers = spyDB.prepare(`
    SELECT user_id, is_spy FROM spy_players WHERE lobby_id = ? AND alive = 1
  `).all(lobbyId);

  let currentRound = 1;
  const totalSpies = alivePlayers.filter(p => p.is_spy === 1).length;

  // ---- CHANGED: 2 rounds instead of 3 ----
  while (currentRound <= 2 && alivePlayers.filter(p => p.is_spy === 1).length > 0) {
    // Randomize speaking order each round
    const speakingOrder = [...alivePlayers].sort(() => Math.random() - 0.5);

    const orderList = speakingOrder.map((p, i) => `${i + 1}. <@${p.user_id}>`).join('\n');

    const roundEmbed = new EmbedBuilder()
      .setColor('#00aaff')
      .setTitle(`🎯 ROUND ${currentRound}/2`)
      .setDescription(
        `**Turn-based speaking begins!**\n\n` +
        `Each player gets **15 seconds** to describe the word.\n` +
        `🔒 Chat is locked except for the current player.\n\n` +
        `**Speaking order this round:**\n${orderList}`
      )
      .setFooter({ text: 'Get ready!' });

    await channel.send({ embeds: [roundEmbed] });
    await sleep(5000);

    // Turn-based speaking with randomized order
    for (const player of speakingOrder) {
      const user = await client.users.fetch(player.user_id).catch(() => null);
      if (!user) continue;

      // Lock everyone
      for (const p of alivePlayers) {
        await channel.permissionOverwrites.edit(p.user_id, {
          SendMessages: false,
        });
      }

      // Unlock current player
      await channel.permissionOverwrites.edit(player.user_id, {
        SendMessages: true,
      });

      const turnEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('🎤 Your Turn!')
        .setDescription(`<@${player.user_id}>, you have **15 seconds** to describe!`)
        .setFooter({ text: 'Say one thing about the word' });

      await channel.send({ embeds: [turnEmbed] });

      await sleep(15000);

      // Lock again
      await channel.permissionOverwrites.edit(player.user_id, {
        SendMessages: false,
      });
    }

    // Discussion phase - 2 minutes
    for (const player of alivePlayers) {
      await channel.permissionOverwrites.edit(player.user_id, {
        SendMessages: true,
      });
    }

    const discussEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('💬 DISCUSSION TIME')
      .setDescription(
        `Round ${currentRound} complete!\n\n` +
        `🔓 Chat unlocked for **2 minutes**.\n` +
        `Discuss who you think the spy is!`
      )
      .setFooter({ text: 'Discussion ends in 2 minutes' });

    await channel.send({ embeds: [discussEmbed] });
    await sleep(120000);

    currentRound++;
  }

  // Lock chat for voting
  for (const player of alivePlayers) {
    await channel.permissionOverwrites.edit(player.user_id, {
      SendMessages: false,
    });
  }

  await handleVoting(client, lobbyId, channel, alivePlayers, secretWord, totalSpies, messageCollector);
}

// ===============================
// VOTING FUNCTION
// ===============================
async function handleVoting(client, lobbyId, channel, alivePlayers, secretWord, totalSpies, messageCollector) {
  const spyDB = client.spyDB;

  const voteEmbed = new EmbedBuilder()
    .setColor('#ff6600')
    .setTitle('🗳️ VOTING TIME')
    .setDescription(
      `**Vote for who you think is the spy!**\n\n` +
      alivePlayers.map((p, i) => `${i + 1}️⃣ <@${p.user_id}>`).join('\n') +
      `\n\nReact with the number of your suspect!\n` +
      `You have **30 seconds** to vote.`
    )
    .setFooter({ text: 'Majority vote eliminates the suspect' });

  const voteMsg = await channel.send({ embeds: [voteEmbed] });

  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
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
    if (count > maxVotes) {
      maxVotes = count;
      eliminatedIndex = index;
    }
  });

  const eliminated = alivePlayers[eliminatedIndex];
  const isSpy = eliminated.is_spy === 1;

  spyDB.prepare(`
    UPDATE spy_players SET alive = 0 WHERE lobby_id = ? AND user_id = ?
  `).run(lobbyId, eliminated.user_id);

  const remainingSpies = alivePlayers.filter(p => p.is_spy === 1 && p.user_id !== eliminated.user_id).length;

  let resultEmbed;

  if (isSpy && (totalSpies === 1 || remainingSpies === 0)) {
    resultEmbed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ PLAYERS WIN!')
      .setDescription(
        `<@${eliminated.user_id}> was **THE SPY!**\n\n` +
        `🎉 Congratulations to all regular players!\n\n` +
        `**The secret word was:** \`${secretWord}\``
      )
      .setTimestamp();

    await channel.send({ embeds: [resultEmbed] });

    const endEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎮 Game Successfully Ended')
      .setDescription(`Thanks for playing Spy!\n\nThis channel will be deleted in 15 seconds...`)
      .setFooter({ text: 'GG WP!' })
      .setTimestamp();

    await channel.send({ embeds: [endEmbed] });
    messageCollector.stop();

    setTimeout(async () => {
      await channel.delete().catch(() => {});
      spyDB.prepare(`DELETE FROM spy_players WHERE lobby_id = ?`).run(lobbyId);
      spyDB.prepare(`DELETE FROM spy_lobbies WHERE lobby_id = ?`).run(lobbyId);
      activeGames.delete(lobbyId);
    }, 15000);

  } else if (isSpy && totalSpies === 2 && remainingSpies === 1) {
    resultEmbed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('⚠️ SPY ELIMINATED')
      .setDescription(
        `<@${eliminated.user_id}> was **A SPY!**\n\n` +
        `But there's still **1 spy remaining**...\n\n` +
        `Starting another 2 rounds in 5 seconds!`
      )
      .setTimestamp();

    await channel.send({ embeds: [resultEmbed] });
    await sleep(5000);

    const newAlivePlayers = spyDB.prepare(`
      SELECT user_id, is_spy FROM spy_players WHERE lobby_id = ? AND alive = 1
    `).all(lobbyId);

    await runGameLoop(client, lobbyId, channel, newAlivePlayers, secretWord);

  } else {
    const spyList = alivePlayers.filter(p => p.is_spy === 1).map(p => `<@${p.user_id}>`).join(', ');

    resultEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('SPIES WIN!')
      .setDescription(
        `<@${eliminated.user_id}> was **NOT A SPY!**\n\n` +
        `The ${totalSpies === 1 ? 'spy was' : 'spies were'}: ${spyList}\n\n` +
        `**The secret word was:** \`${secretWord}\``
      )
      .setTimestamp();

    await channel.send({ embeds: [resultEmbed] });

    const endEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('Game Successfully Ended')
      .setDescription(`Thanks for playing Spy!\n\nThis channel will be deleted in 15 seconds...`)
      .setFooter({ text: 'GG WP!' })
      .setTimestamp();

    await channel.send({ embeds: [endEmbed] });
    messageCollector.stop();

    setTimeout(async () => {
      await channel.delete().catch(() => {});
      spyDB.prepare(`DELETE FROM spy_players WHERE lobby_id = ?`).run(lobbyId);
      spyDB.prepare(`DELETE FROM spy_lobbies WHERE lobby_id = ?`).run(lobbyId);
      activeGames.delete(lobbyId);
    }, 15000);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
