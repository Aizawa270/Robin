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
// NERFED HINT SYSTEM
// Hints are now vague — category/theme only, never close to the word itself
// ===============================
const hintCategories = [
  // [matcher fn, vague hint]
  [w => ['apple','banana','mango','avocado','pineapple','watermelon','strawberry','blueberry','fruit'].includes(w), 'something edible'],
  [w => ['bread','pasta','pizza','burger','sushi','taco','waffle','pancake','soup','salad','sandwich','noodles','dumpling','curry','steak','bacon'].includes(w), 'something edible'],
  [w => ['cheese','butter','chocolate','cookie','icecream','cake','popcorn','pretzel'].includes(w), 'something edible'],
  [w => ['coffee','tea','smoothie','lemonade','milkshake','juice'].includes(w), 'something drinkable'],
  [w => ['pillow','blanket','mattress','curtain','carpet','lamp','candle','mirror','fridge','microwave','kettle','toaster','blender','vacuum','broom','bucket'].includes(w), 'found indoors'],
  [w => ['scissors','stapler','envelope','drawer','cabinet','shelf','hanger','basket'].includes(w), 'an everyday object'],
  [w => ['umbrella','lighter','battery','charger','remote','headphones','speaker','camera'].includes(w), 'a portable object'],
  [w => ['airport','station','harbour','lighthouse','stadium','gymnasium','aquarium','warehouse','factory','rooftop','basement','attic'].includes(w), 'a location'],
  [w => ['bakery','pharmacy','laundromat','barbershop','nightclub','casino','campsite','greenhouse'].includes(w), 'a place people go'],
  [w => ['cemetery','cathedral','mosque','temple'].includes(w), 'a place with history'],
  [w => ['volcano','glacier','waterfall','canyon','swamp','meadow','coral','dune','quicksand','lava','geyser','aurora'].includes(w), 'found in nature'],
  [w => ['avalanche','tornado','hurricane','blizzard','drought','fog','hail','lightning','tidal wave','earthquake'].includes(w), 'a natural event'],
  [w => ['penguin','flamingo','chameleon','platypus','narwhal','hamster','ferret','otter','panther','cheetah','hyena','gorilla','koala','porcupine','armadillo','iguana'].includes(w), 'a living creature'],
  [w => ['piranha','seahorse','jellyfish','lobster','octopus','squid','stingray','barracuda'].includes(w), 'a living creature'],
  [w => ['falcon','vulture','parrot','toucan','pelican','peacock','swan','crow'].includes(w), 'a living creature'],
  [w => ['surgeon','architect','mechanic','librarian','lifeguard','referee','bouncer','bartender','astronaut','pilot','conductor','magician','comedian','journalist','hacker','sculptor'].includes(w), 'a type of person'],
  [w => ['satellite','submarine','helicopter','drone','telescope','microscope','generator','compass'].includes(w), 'a piece of equipment'],
  [w => ['algorithm','database','browser','password','firewall','notification','shortcut','download'].includes(w), 'related to technology'],
  [w => ['marathon','tournament','penalty','knockout','scoreboard','trophy','champion','archery','fencing','surfing','paragliding','wrestling','bobsled','lacrosse','polo'].includes(w), 'related to competition'],
  [w => ['hoodie','trenchcoat','tuxedo','kimono','poncho','beret','beanie','gloves','sneakers','sandals','stilettos','loafers'].includes(w), 'something worn'],
  [w => ['bracelet','anklet','brooch','monocle'].includes(w), 'something worn'],
  [w => ['deadline','rumour','tradition','ceremony','superstition','conspiracy','alibi','blackout','rebellion','negotiation','quarantine','inheritance','rivalry','tribute','embargo','verdict'].includes(w), 'an abstract concept'],
  [w => ['trapdoor','booby trap','disguise','ransom','hostage','ambush','decoy','smuggler','treasure','shipwreck','pirate','bounty','expedition','artifact','prophecy','riddle'].includes(w), 'something mysterious'],
];

function getHint(word) {
  const lower = word.toLowerCase();
  for (const [matcher, hint] of hintCategories) {
    if (matcher(lower)) return hint;
  }
  // Absolute fallback — just length, no letter
  return `${word.length} letters long`;
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
        await ch.send({ embeds: [new EmbedBuilder()
          .setColor('#ff6600')
          .setTitle('⏰ Lobby Expired')
          .setDescription('The spy lobby was automatically disbanded after 30 minutes of inactivity.')] });
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
// WORD DETECTION
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
// CLEANUP HELPER
// ===============================
async function cleanupGame(client, lobbyId, channel) {
  try {
    await channel.delete().catch(() => {});
  } catch {}
  try {
    client.spyDB.prepare('DELETE FROM spy_players WHERE lobby_id = ?').run(lobbyId);
    client.spyDB.prepare('DELETE FROM spy_lobbies WHERE lobby_id = ?').run(lobbyId);
  } catch {}
  activeGames.delete(lobbyId);
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
      setLobbyExpiry(client, lobbyId, message.guild.id, message.channel.id);

      const hintsOff = client.spyHintGlobal === false;

      const embed = new EmbedBuilder()
        .setColor('#ec4899')
        .setTitle('🕵️ Spy Lobby Created')
        .setDescription(
          `**Host:** ${message.author}\n` +
          `**Players:** 1/∞\n` +
          `**Status:** Waiting for players\n` +
          `**Spy hint:** ${hintsOff ? 'Off (globally disabled)' : 'On'}\n\n` +
          `**Commands:**\n` +
          `• \`spy join\` - Join the lobby\n` +
          `• \`spy leave\` - Leave the lobby\n` +
          `• \`spy start\` - Start game (min 5 players)\n` +
          `• \`spy hint off\` - Disable hint globally (admin only)\n\n` +
          `**How it works:**\n` +
          `• 2 rounds of turn-based speaking\n` +
          `• Each player gets 15 seconds per turn\n` +
          `• Discussion time after each round (2 mins)\n` +
          `• Vote to eliminate the spy!\n` +
          `• Wrong vote? One more bonus round before spies win.\n\n` +
          `⏰ Lobby auto-disbands in **30 minutes** if not started.`
        )
        .setFooter({ text: `Lobby ID: ${lobbyId} • Need 4 more players` });

      return message.reply({ embeds: [embed] });
    }

    // ===============================
    // HINT TOGGLE — GLOBAL
    // ===============================
    if (sub === 'hint') {
      if (!isAuthorized(message)) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ff0000').setTitle('❌ No Permission')
          .setDescription('Only admins can toggle hints globally!')] });
      }

      const action = args[1]?.toLowerCase();

      if (action === 'off') {
        client.spyHintGlobal = false;
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ffaa00').setTitle('❌ Hints Disabled Globally')
          .setDescription('The spy will **not** receive a hint in **any** game until re-enabled.\n\nUse `spy hint on` to re-enable.')
          .setFooter({ text: 'This setting persists until changed.' })] });
      } else if (action === 'on') {
        client.spyHintGlobal = true;
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#00ff00').setTitle('✅ Hints Enabled Globally')
          .setDescription('The spy will receive a vague hint word in **all** games.')
          .setFooter({ text: 'This is the default setting.' })] });
      } else {
        const current = client.spyHintGlobal === false ? 'Off' : 'On';
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor('#5865F2').setTitle('💡 Hint Setting')
          .setDescription(`Current global hint setting: **${current}**\n\nUse \`spy hint off\` or \`spy hint on\`.'`)] });
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

      clearLobbyExpiry(lobby.lobby_id);
      spyDB.prepare("UPDATE spy_lobbies SET status = 'starting' WHERE lobby_id = ?").run(lobby.lobby_id);

      // Reply first, then proceed — prevents "something went wrong" on interaction timeout
      try {
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor('#ffaa00').setTitle('🎮 Starting Game...')
          .setDescription('Creating private channel and sending DMs...')] });
      } catch {}

      // Create spy channel
      let channel;
      try {
        channel = await message.guild.channels.create({
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
      } catch (err) {
        console.error('[Spy] Failed to create channel:', err);
        return;
      }

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

      const hintsOff = client.spyHintGlobal === false;
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
                  (spyHint ? `💡 **Hint:** \`${spyHint}\`\n\n` : '') +
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
            `**Spy hint:** ${hintsOff ? 'Off' : 'On (vague)'}\n\n` +
            `${dmFailed.length > 0 ? `⚠️ **Failed DMs:** ${dmFailed.map(id => `<@${id}>`).join(', ')}\nMake sure DMs are enabled!\n\n` : ''}` +
            `**📋 Game Rules:**\n` +
            `• Check your DMs for your role\n` +
            `• 2 rounds of turn-based speaking (randomized order)\n` +
            `• Each player gets 15 seconds per turn\n` +
            `• 2 minutes discussion after each round\n` +
            `• Vote to eliminate suspects\n` +
            `• Wrong vote? One bonus round, then vote again — spies win if wrong again!\n\n` +
            `🚨 **If anyone says the secret word exactly, spies win instantly!**`
          )
          .setFooter({ text: 'Game starting in 5 seconds...' })
          .setTimestamp()],
      });

      await sleep(5000);

      // Wrap game loop so any crash doesn't bubble up as interaction error
      runGameLoop(client, lobby.lobby_id, channel, players, secretWord, false).catch(err => {
        console.error('[Spy] Game loop error:', err);
      });

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
        '• `spy hint off` - Disable spy hint globally (admin only)\n' +
        '• `spy hint on` - Re-enable spy hint globally (admin only)\n' +
        '• `spy start` - Start game (host/admin only, min 5 players)\n' +
        '• `spy end` - End game and close lobby (host/admin only)\n\n' +
        '💡 Spy hints are **on by default** — vague category hints only.'
      )
      .setFooter({ text: 'Have fun finding the spy!' })] });
  },
};

// ===============================
// GAME LOOP
// isFinalChance: true = this is the bonus round after a wrong vote; one more wrong vote = spies win
// ===============================
async function runGameLoop(client, lobbyId, channel, players, secretWord, isFinalChance) {
  const spyDB = client.spyDB;
  const timers = [];
  activeGames.set(lobbyId, timers);

  // Set up secret word detection collector
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
      await cleanupGame(client, lobbyId, channel);
    }, 10000);
  });

  let alivePlayers = spyDB.prepare('SELECT user_id, is_spy FROM spy_players WHERE lobby_id = ? AND alive = 1').all(lobbyId);
  const totalSpies = alivePlayers.filter(p => p.is_spy === 1).length;

  // Run 2 rounds (or just 1 if this is the bonus round)
  const roundsToRun = isFinalChance ? 1 : 2;

  for (let currentRound = 1; currentRound <= roundsToRun; currentRound++) {
    const roundLabel = isFinalChance ? 'BONUS ROUND' : `ROUND ${currentRound}/2`;
    const speakingOrder = [...alivePlayers].sort(() => Math.random() - 0.5);
    const orderList = speakingOrder.map((p, i) => `${i + 1}. <@${p.user_id}>`).join('\n');

    await channel.send({ embeds: [new EmbedBuilder()
      .setColor(isFinalChance ? '#ff6600' : '#00aaff')
      .setTitle(`🎯 ${roundLabel}`)
      .setDescription(
        isFinalChance
          ? `**Last chance!** Players voted out a non-spy last round.\n\n` +
            `Find the real spy this time — one more wrong vote and spies win!\n\n` +
            `Each player gets **15 seconds** to speak.\n\n` +
            `**Speaking order:**\n${orderList}`
          : `**Turn-based speaking begins!**\n\n` +
            `Each player gets **15 seconds** to describe the word.\n` +
            `🔒 Chat is locked except for the current player.\n\n` +
            `**Speaking order this round:**\n${orderList}`
      )
      .setFooter({ text: 'Get ready!' })] });

    await sleep(5000);

    for (const player of speakingOrder) {
      for (const p of alivePlayers) {
        await channel.permissionOverwrites.edit(p.user_id, { SendMessages: false }).catch(() => {});
      }
      await channel.permissionOverwrites.edit(player.user_id, { SendMessages: true }).catch(() => {});

      await channel.send({ embeds: [new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('🎤 Your Turn!')
        .setDescription(`<@${player.user_id}>, you have **15 seconds** to describe!`)
        .setFooter({ text: 'Say one thing about the word' })] });

      await sleep(15000);

      await channel.permissionOverwrites.edit(player.user_id, { SendMessages: false }).catch(() => {});
    }

    // Unlock all for discussion
    for (const player of alivePlayers) {
      await channel.permissionOverwrites.edit(player.user_id, { SendMessages: true }).catch(() => {});
    }

    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('💬 DISCUSSION TIME')
      .setDescription(
        `${roundLabel} complete!\n\n` +
        `🔓 Chat unlocked for **2 minutes**.\n` +
        `Discuss who you think the spy is!`
      )
      .setFooter({ text: 'Discussion ends in 2 minutes' })] });

    await sleep(120000);
  }

  // Lock for voting
  for (const player of alivePlayers) {
    await channel.permissionOverwrites.edit(player.user_id, { SendMessages: false }).catch(() => {});
  }

  await handleVoting(client, lobbyId, channel, alivePlayers, secretWord, totalSpies, messageCollector, isFinalChance);
}

// ===============================
// VOTING
// ===============================
async function handleVoting(client, lobbyId, channel, alivePlayers, secretWord, totalSpies, messageCollector, isFinalChance) {
  const spyDB = client.spyDB;
  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  const voteMsg = await channel.send({ embeds: [new EmbedBuilder()
    .setColor('#ff6600')
    .setTitle('🗳️ VOTING TIME')
    .setDescription(
      `**Vote for who you think is the spy!**\n\n` +
      alivePlayers.map((p, i) => `${numberEmojis[i]} <@${p.user_id}>`).join('\n') +
      `\n\nReact with the number of your suspect!\n` +
      `You have **30 seconds** to vote.\n\n` +
      (isFinalChance ? `⚠️ **This is the final vote. Wrong answer = spies win!**` : '')
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

  // ── SPY(S) CAUGHT ──
  if (isSpy && (totalSpies === 1 || remainingSpies === 0)) {
    messageCollector.stop();

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

    setTimeout(() => cleanupGame(client, lobbyId, channel), 10000);
    return;
  }

  // ── ONE OF TWO SPIES CAUGHT ──
  if (isSpy && totalSpies === 2 && remainingSpies === 1) {
    await channel.send({ embeds: [new EmbedBuilder()
      .setColor('#ffaa00').setTitle('⚠️ SPY ELIMINATED')
      .setDescription(
        `<@${eliminated.user_id}> was **A SPY!**\n\n` +
        `But there's still **1 spy remaining**...\n\n` +
        `Starting another 2 rounds in 5 seconds!`
      ).setTimestamp()] });

    messageCollector.stop();
    await sleep(5000);

    const newAlivePlayers = spyDB.prepare('SELECT user_id, is_spy FROM spy_players WHERE lobby_id = ? AND alive = 1').all(lobbyId);
    await runGameLoop(client, lobbyId, channel, newAlivePlayers, secretWord, false);
    return;
  }

  // ── NON-SPY VOTED OUT ──
  if (!isSpy) {
    if (isFinalChance) {
      // Already had their bonus round — spies win now
      messageCollector.stop();

      const spyList = alivePlayers.filter(p => p.is_spy === 1 && p.user_id !== eliminated.user_id).map(p => `<@${p.user_id}>`).join(', ');

      await channel.send({ embeds: [new EmbedBuilder()
        .setColor('#ff0000').setTitle('🕵️ SPIES WIN!')
        .setDescription(
          `<@${eliminated.user_id}> was **NOT A SPY!** Again...\n\n` +
          `The ${totalSpies === 1 ? 'spy was' : 'spies were'}: ${spyList}\n\n` +
          `**The secret word was:** \`${secretWord}\``
        ).setTimestamp()] });

      await channel.send({ embeds: [new EmbedBuilder()
        .setColor('#5865F2').setTitle('🎮 Game Over')
        .setDescription('This channel will be deleted in **10 seconds**...')
        .setFooter({ text: 'GG WP!' }).setTimestamp()] });

      setTimeout(() => cleanupGame(client, lobbyId, channel), 10000);

    } else {
      // First wrong vote — give a bonus round
      await channel.send({ embeds: [new EmbedBuilder()
        .setColor('#ff6600').setTitle('❌ WRONG VOTE!')
        .setDescription(
          `<@${eliminated.user_id}> was **NOT a spy!**\n\n` +
          `The spy is still among you...\n\n` +
          `🔄 **One bonus round** before the final vote!\n` +
          `⚠️ If you vote wrong again, the spies win!\n\n` +
          `Starting bonus round in 5 seconds...`
        ).setTimestamp()] });

      messageCollector.stop();
      await sleep(5000);

      const newAlivePlayers = spyDB.prepare('SELECT user_id, is_spy FROM spy_players WHERE lobby_id = ? AND alive = 1').all(lobbyId);
      await runGameLoop(client, lobbyId, channel, newAlivePlayers, secretWord, true);
    }
  }
}