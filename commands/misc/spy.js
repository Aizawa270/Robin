const {
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

const { words } = require('../../utils/spyWords');

const MIN_PLAYERS = 5;
const TURN_TIME = 15_000;
const DISCUSS_SHORT = 120_000;
const DISCUSS_LONG = 300_000;
const VOTE_TIME = 60_000;

const NUM_EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

function shuffle(a){ return a.sort(()=>Math.random()-0.5); }
function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

module.exports = {
  name: 'spy',
  async execute(client, message, args) {
    if (!message.guild) return;
    const sub = (args[0]||'').toLowerCase();
    const db = client.spyDB;

    const lobby = db.prepare(
      'SELECT * FROM spy_lobbies WHERE guild_id=?'
    ).get(message.guild.id);

    /* ================= LOBBY ================= */

    if (sub === 'lobby') {
      if (lobby) return message.reply('Lobby already exists.');
      db.prepare(`
        INSERT INTO spy_lobbies (guild_id, host_id, channel_id, status)
        VALUES (?, ?, ?, 'lobby')
      `).run(message.guild.id, message.author.id, message.channel.id);
      return message.reply('🕵️ Spy lobby created.');
    }

    if (sub === 'join') {
      if (!lobby) return message.reply('No lobby.');
      const exists = db.prepare(`
        SELECT 1 FROM spy_players WHERE lobby_id=? AND user_id=?
      `).get(lobby.lobby_id, message.author.id);
      if (exists) return message.reply('Already joined.');
      db.prepare(`
        INSERT INTO spy_players (lobby_id, user_id)
        VALUES (?, ?)
      `).run(lobby.lobby_id, message.author.id);
      return message.reply('Joined.');
    }

    if (sub === 'start') {
      if (!lobby) return message.reply('No lobby.');
      if (lobby.host_id !== message.author.id)
        return message.reply('Host only.');

      const players = db.prepare(`
        SELECT * FROM spy_players WHERE lobby_id=?
      `).all(lobby.lobby_id);

      if (players.length < MIN_PLAYERS)
        return message.reply('Need at least 5 players.');

      const spyCount = players.length >= 10 ? 2 : 1;
      const shuffled = shuffle([...players]);
      const spies = shuffled.slice(0, spyCount);
      const word = rand(words);

      spies.forEach(s=>{
        db.prepare(`
          UPDATE spy_players SET is_spy=1 WHERE id=?
        `).run(s.id);
      });

      const channel = await message.guild.channels.create({
        name:'spy-game',
        type:ChannelType.GuildText,
        permissionOverwrites:[
          {id:message.guild.roles.everyone,deny:[PermissionsBitField.Flags.ViewChannel]},
          ...players.map(p=>({
            id:p.user_id,
            allow:[
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages
            ]
          }))
        ]
      });

      db.prepare(`
        UPDATE spy_lobbies
        SET spy_channel_id=?, secret_word=?, status='playing', round=1
        WHERE lobby_id=?
      `).run(channel.id, word, lobby.lobby_id);

      for (const p of players) {
        const u = await client.users.fetch(p.user_id).catch(()=>null);
        if (!u) continue;
        if (spies.some(s=>s.user_id===p.user_id))
          u.send('🕵️ You are the **SPY**.');
        else
          u.send(`🧠 Secret word: **${word}**`);
      }

      await channel.send('🕵️ Game started.');
      runGame(client, db, lobby.lobby_id, channel);
    }
  }
};

/* ================= GAME LOOP ================= */

async function runGame(client, db, lobbyId, channel) {
  for (let round = 1; round <= 3; round++) {
    await channel.send(`🔁 **Round ${round}**`);

    const players = db.prepare(`
      SELECT * FROM spy_players WHERE lobby_id=? AND alive=1
    `).all(lobbyId);

    for (const p of players) {
      await channel.permissionOverwrites.edit(
        channel.guild.roles.everyone,
        { SendMessages:false }
      );
      await channel.permissionOverwrites.edit(
        p.user_id,
        { SendMessages:true }
      );

      await channel.send(`<@${p.user_id}> — your turn (15s)`);
      await sleep(TURN_TIME);
      await channel.permissionOverwrites.edit(p.user_id,{SendMessages:false});
    }

    await channel.permissionOverwrites.edit(
      channel.guild.roles.everyone,
      { SendMessages:true }
    );

    await channel.send('💬 Discussion time.');
    await sleep(round===3 ? DISCUSS_LONG : DISCUSS_SHORT);
  }

  await startVoting(db, lobbyId, channel);
}

/* ================= VOTING ================= */

async function startVoting(db, lobbyId, channel) {
  const players = db.prepare(`
    SELECT * FROM spy_players WHERE lobby_id=? AND alive=1
  `).all(lobbyId);

  const desc = players
    .map((p,i)=>`${NUM_EMOJIS[i]} <@${p.user_id}>`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🗳️ Vote to Eliminate')
    .setDescription(desc)
    .setColor('#ef4444');

  const msg = await channel.send({ embeds:[embed] });

  for (let i=0;i<players.length && i<NUM_EMOJIS.length;i++)
    await msg.react(NUM_EMOJIS[i]);

  await sleep(VOTE_TIME);

  const fetched = await msg.fetch();
  const votes = {};

  fetched.reactions.cache.forEach((r,i)=>{
    if (!NUM_EMOJIS.includes(r.emoji.name)) return;
    votes[i] = r.count - 1;
  });

  let max = -1, index = null;
  for (const i in votes) {
    if (votes[i] > max) {
      max = votes[i];
      index = i;
    }
  }

  if (index === null)
    return channel.send('No votes. Game void.');

  const eliminated = players[index];
  db.prepare(`
    UPDATE spy_players SET alive=0 WHERE id=?
  `).run(eliminated.id);

  await channel.send(`☠️ <@${eliminated.user_id}> has been eliminated.`);

  const isSpy = eliminated.is_spy === 1;
  const aliveSpies = db.prepare(`
    SELECT * FROM spy_players
    WHERE lobby_id=? AND alive=1 AND is_spy=1
  `).all(lobbyId);

  if (isSpy && aliveSpies.length === 0)
    return channel.send('🎉 **Players win! Spy eliminated.**');

  if (!isSpy)
    return channel.send('🕵️ **Spy wins! Wrong elimination.**');

  await channel.send('🕵️ One spy remains. Game continues.');
}